"""Read-only source indexing. All generated data stays in the local SQLite cache."""
import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript("""
      CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,path TEXT UNIQUE,title TEXT,kind TEXT,
        pages INTEGER,stamp TEXT,digest TEXT,empty_pages INTEGER);
      CREATE TABLE IF NOT EXISTS pages(book_id TEXT,page INTEGER,content TEXT,
        PRIMARY KEY(book_id,page));
      CREATE TABLE IF NOT EXISTS search_dirty(book_id TEXT,page INTEGER,PRIMARY KEY(book_id,page));
      CREATE TRIGGER IF NOT EXISTS search_page_insert AFTER INSERT ON pages BEGIN
        INSERT OR IGNORE INTO search_dirty VALUES(new.book_id,new.page); END;
      CREATE TRIGGER IF NOT EXISTS search_page_update AFTER UPDATE ON pages BEGIN
        INSERT OR IGNORE INTO search_dirty VALUES(old.book_id,old.page);
        INSERT OR IGNORE INTO search_dirty VALUES(new.book_id,new.page); END;
      CREATE TRIGGER IF NOT EXISTS search_page_delete AFTER DELETE ON pages BEGIN
        INSERT OR IGNORE INTO search_dirty VALUES(old.book_id,old.page); END;
    """)
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name='search_chunks'").fetchone():
        db.executescript("""
          CREATE VIRTUAL TABLE search_chunks USING fts5(book_id UNINDEXED,page UNINDEXED,
            start UNINDEXED,end UNINDEXED,heading,content,tokenize='porter unicode61');
          INSERT OR IGNORE INTO search_dirty SELECT book_id,page FROM pages;
        """)
    return db


def chunk_spans(text, limit=1600):
    """Overlapping original spans, ending at a paragraph/sentence where possible."""
    start = 0
    while start < len(text):
        end = min(len(text), start + limit)
        if end < len(text):
            cuts = [m.end() for m in re.finditer(r'\n\s*\n|[.!?][ \t\r\n]+', text[start:end])]
            if cuts and cuts[-1] >= limit // 2:
                end = start + cuts[-1]
            else:
                cut = text.rfind('\n', start + limit // 2, end)
                if cut >= 0:
                    end = cut + 1
        yield start, end
        if end == len(text):
            break
        start = max(start + 1, end - 200)


def sync_search(db):
    dirty = db.execute('SELECT * FROM search_dirty').fetchall()
    if not dirty:
        return
    with db:
        for row in dirty:
            args = (row['book_id'], row['page'])
            db.execute('DELETE FROM search_chunks WHERE book_id=? AND page=?', args)
            page = db.execute('SELECT content FROM pages WHERE book_id=? AND page=?', args).fetchone()
            if page:
                text = page['content']
                for start, end in chunk_spans(text):
                    original = text[start:end]
                    normalized = re.sub(r'(?<=[A-Za-z])-[ \t]*\r?\n[ \t]*(?=[a-z])', '', original)
                    heading = ' '.join(line.strip() for line in original.splitlines()
                                       if 2 <= len(line.strip()) <= 70 and
                                       (line.strip().isupper() or line.strip().istitle()))
                    db.execute('INSERT INTO search_chunks VALUES (?,?,?,?,?,?)',
                               (*args, start, end, heading, normalized))
            db.execute('DELETE FROM search_dirty WHERE book_id=? AND page=?', args)


def ranked_chunks(db, ids, queries):
    sync_search(db)
    marks = ','.join('?' for _ in ids)
    result = {}
    # Each question gets its own candidate quota, so a second rule cannot be
    # erased by a strong heading match for the first question.
    for query in queries:
        terms = list(dict.fromkeys(re.findall(r'[\w가-힣]+', query.lower())))[:24]
        terms = [t for t in terms if len(t) > 1 and t not in {'the','and','for','with','from','that','this','how','does','can','basic','set'}]
        if not terms:
            continue
        match = ' OR '.join('"' + t.replace('"', '""') + '"' for t in terms)
        rows = db.execute(f'''SELECT book_id,page,start,end,bm25(search_chunks,0,0,0,0,3,1) AS rank
          FROM search_chunks WHERE search_chunks MATCH ? AND book_id IN ({marks})
          ORDER BY rank LIMIT 32''', [match, *ids]).fetchall()
        for rank, row in enumerate(rows):
            key = (row['book_id'], row['page'])
            score = 1 / (20 + rank)
            if key not in result or score > result[key]['score']:
                result[key] = dict(row, score=score)
    return result


def index(db, roots, strict=False):
    from pypdf import PdfReader
    seen = set()
    errors = []
    for root in roots:
        base = Path(root["path"]).resolve(strict=True)
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in (".pdf", ".md", ".txt"):
                continue
            path = path.resolve()
            if not path.is_relative_to(base):
                continue
            if any(path.is_relative_to((base / entry).resolve()) for entry in root.get("exclude", [])):
                continue
            # Keep migrated IDs stable when refreshing the existing source path.
            known = db.execute("SELECT id FROM books WHERE path=?", (str(path),)).fetchone()
            book_id = known["id"] if known else hashlib.sha256(str(path).encode()).hexdigest()[:24]
            seen.add(book_id)
            stat = path.stat()
            stamp = f"{stat.st_size}:{stat.st_mtime_ns}"
            previous = db.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
            kind = root["kind"]
            # The original 3e material is reference-only; use the named 4e conversion.
            if kind == "rule" and "MD 원본" in str(path):
                kind = "reference"
            if previous and previous["stamp"] == stamp and previous["kind"] == kind:
                continue
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            try:
                if path.suffix.lower() == ".pdf":
                    reader = PdfReader(str(path))
                    if reader.is_encrypted and not reader.decrypt(""):
                        raise ValueError("암호가 설정된 PDF입니다.")
                    count = len(reader.pages)
                    source = ((i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages))
                else:
                    text = path.read_text(encoding="utf-8-sig")
                    sections = [text[i:i + 8000] for i in range(0, len(text), 8000)] or [""]
                    count = len(sections)
                    source = enumerate(sections, 1)
                empty = 0
                with db:
                    db.execute("DELETE FROM pages WHERE book_id=?", (book_id,))
                    for number, content in source:
                        content = content.replace("\x00", "")
                        if len(content.strip()) < 20:
                            empty += 1
                        db.execute("INSERT INTO pages VALUES (?,?,?)", (book_id, number, content))
                        if number % 100 == 0:
                            emit({"progress": path.name, "page": number, "total": count})
                    db.execute("INSERT OR REPLACE INTO books VALUES (?,?,?,?,?,?,?,?)",
                               (book_id, str(path), path.stem, kind, count, stamp, digest.hexdigest(), empty))
                emit({"indexed": path.name, "pages": count, "emptyPages": empty})
            except Exception as error:
                errors.append(path.name + ': ' + str(error))
                emit({"error": path.name, "message": str(error)})
                # Never use a stale index when the source changed but extraction failed.
                with db:
                    db.execute("DELETE FROM pages WHERE book_id=?", (book_id,))
                    db.execute("DELETE FROM books WHERE id=?", (book_id,))
    with db:
        for row in db.execute("SELECT id FROM books").fetchall():
            if row["id"] not in seen:
                db.execute("DELETE FROM pages WHERE book_id=?", (row["id"],))
                db.execute("DELETE FROM books WHERE id=?", (row["id"],))
    sync_search(db)
    if strict and errors:
        raise ValueError('색인 실패: ' + '; '.join(errors))


def needs_index(db, roots):
    current = {}
    for root in roots:
        base = Path(root['path']).resolve(strict=True)
        for path in base.rglob('*'):
            if not path.is_file() or path.suffix.lower() not in ('.pdf', '.md', '.txt'):
                continue
            path = path.resolve()
            if not path.is_relative_to(base) or any(path.is_relative_to((base / entry).resolve()) for entry in root.get('exclude', [])):
                continue
            stat = path.stat()
            kind = 'reference' if root['kind'] == 'rule' and 'MD 원본' in str(path) else root['kind']
            current[str(path)] = (f'{stat.st_size}:{stat.st_mtime_ns}', kind)
    saved = {row['path']: (row['stamp'], row['kind']) for row in db.execute('SELECT path,stamp,kind FROM books')}
    return current != saved


def available(path, roots):
    path = Path(path).resolve()
    if not path.is_file():
        return False
    if not roots:
        return True
    return any(path.is_relative_to(Path(root["path"]).resolve()) and not any(
        path.is_relative_to((Path(root["path"]) / entry).resolve())
        for entry in root.get("exclude", [])) for root in roots)


def catalog(db, roots=None):
    result = []
    for row in db.execute("SELECT id,title,kind,pages,digest,empty_pages AS emptyPages,path FROM books ORDER BY kind,title"):
        book = dict(row)
        if not available(book["path"], roots):
            continue
        book["format"] = "pdf" if book.pop("path").lower().endswith(".pdf") else "text"
        result.append(book)
    return result


RULE_TOPICS = (
    (r"흥정|상업|\bmerchant\b|\bbargain\w*", "Merchant"),
    (r"빠른\s*승부|\bquick\s+contests?\b", "Quick Contests"),
    (r"\bcommercial\s+transactions\b", "Commercial Transactions"),
)


def query_phrases(queries):
    """Extract short rule titles before scoring noisy natural-language requests."""
    phrases = []
    for query in queries:
        basic = bool(re.search(r"\bbasic\s+set\b|\bB\s*\d{1,3}\b", query, re.I))
        topics = [title for pattern, title in RULE_TOPICS if re.search(pattern, query, re.I)]
        if not topics and len(query.split()) <= 5 and not re.search(r"\bB\s*\d{1,3}\b", query, re.I):
            topics = [query.strip()]
        for title in topics:
            item = (title, basic)
            if title and item not in phrases:
                phrases.append(item)
    return phrases


def printed_page(content, number):
    # Running headers/footers, not prose citations or a guessed PDF offset.
    for line in content.splitlines():
        match = re.fullmatch(r"\s*(?:(\d{1,3})\s+([A-Z][A-Z &’'/:,\-]+)|([A-Z][A-Z &’'/:,\-]+)\s+(\d{1,3}))\s*", line)
        if match and int(match[1] or match[4]) == number:
            return True
    return False


def search(db, ids, queries):
    if not ids:
        return []
    keyword_queries = [re.sub(r"\bB\s*\d{1,3}\b|\bbasic\s+set\b", "", q, flags=re.I) for q in queries]
    terms = list(dict.fromkeys(t.lower() for q in keyword_queries for t in re.findall(r"[\w가-힣-]{2,}", q)))[:64]
    phrases = query_phrases(queries)
    references = list(dict.fromkeys(int(n) for q in queries for n in re.findall(r"\bB\s*(\d{1,3})\b", q, re.I)))[:6]
    candidates = []
    marks = ",".join("?" for _ in ids)
    for book in db.execute(f"SELECT path,stamp FROM books WHERE id IN ({marks})", ids):
        stat = Path(book["path"]).stat()
        if book["stamp"] != f"{stat.st_size}:{stat.st_mtime_ns}":
            raise ValueError("로컬 자료가 변경되었습니다. 룰북 색인을 갱신하세요.")
    chunks = ranked_chunks(db, ids, [*keyword_queries, *(p[0] for p in phrases)])
    keys = list(chunks)
    selected = ' OR '.join('(p.book_id=? AND p.page=?)' for _ in keys) or '0'
    selected_args = [v for key in keys for v in key]
    if references:
        selected = '1'  # Printed footer lookup; never guess a PDF offset.
        selected_args = []
    for r in db.execute(f"SELECT p.*,b.title,b.kind,b.digest,b.path FROM pages p JOIN books b ON b.id=p.book_id WHERE b.id IN ({marks}) AND ({selected} OR (b.kind='scenario' AND p.page=1))", [*ids, *selected_args]):
        chunk = chunks.get((r['book_id'], r['page']))
        if not chunk and not references and not (r['kind'] == 'scenario' and r['page'] == 1):
            continue
        lower = r["content"].lower()
        hits = [t for t in terms if t in lower]
        score = chunk['score'] * 400 if chunk else 0
        priority, matched = 0, []
        heading_at = None
        # Prefer the named rule/skill heading over pages that merely repeat
        # broad words such as success, roll and failure.
        basic = bool(re.search(r"\bbasic\s+set\b", r["title"], re.I))
        reference = next((n for n in references if basic and r["path"].lower().endswith('.pdf') and printed_page(r["content"], n)), None)
        if reference is not None:
            priority = 1000
            matched.append(f"B{reference}")
        for phrase, basic_only in phrases:
            if basic_only and not basic:
                continue
            pattern = r"\s+".join(re.escape(word) for word in phrase.lower().split())
            occurrence = re.search(r"(?<!\w)" + pattern + r"(?!\w)", lower)
            if occurrence:
                score += 10
                heading = re.search(r"(?m)^[ \t]*" + pattern + r"[ \t]*$", lower)
                if heading:
                    priority = max(priority, 100)
                    matched.append(phrase)
                    if heading_at is None:
                        heading_at = heading.start()
        if r["kind"] == "scenario" and r["page"] == 1:
            score += 100
            hits = []
        if not score and not priority:
            continue
        at = heading_at if heading_at is not None else chunk['start'] if chunk else 0
        candidates.append((priority, score, r, max(0, at - 200), matched, reference))
    candidates.sort(key=lambda item: (-item[0], -item[1], item[2]['book_id'], item[2]['page']))
    # Exact printed references remain exact; ordinary headings must not erase
    # lexical candidates for other rules in the same action.
    if references and not terms:
        candidates = [c for c in candidates if c[5] is not None]
    results, counts = [], {}
    for priority, score, row, start, matched, reference in candidates:
        if counts.get(row["book_id"], 0) >= 3 and reference is None:
            continue
        counts[row["book_id"]] = counts.get(row["book_id"], 0) + 1
        results.append({"bookId": row["book_id"], "title": row["title"], "kind": row["kind"],
                        "page": row["page"], "pageLabel": "PDF 페이지" if row["path"].lower().endswith(".pdf") else "텍스트 구간",
                        "digest": row["digest"], "text": row["content"] if reference is not None else context_excerpt(row['content'], start),
                        "adjacentPages": [p for p in (row['page']-1, row['page']+1) if db.execute('SELECT 1 FROM pages WHERE book_id=? AND page=?', (row['book_id'], p)).fetchone()],
                        "retrievalPriority": priority, "matchedRules": matched,
                        **({"printedPage": reference} if reference is not None else {})})
        if len(results) >= 12:
            break
    return results


def context_excerpt(text, start, limit=3000):
    # Keep the hit and neighboring sentences together; citations remain a
    # contiguous slice of the original page. Other pages are explicitly linked.
    boundary = text.rfind('\n', max(0, start-200), start)
    if boundary >= 0:
        start = boundary + 1
    end = min(len(text), start + limit)
    if end < len(text):
        cuts = [m.end() for m in re.finditer(r'\n\s*\n|[.!?][ \t\r\n]+', text[start:end])]
        if cuts and cuts[-1] > limit // 2:
            end = start + cuts[-1]
    return text[start:end]


def read_pages(db, requests, allowed):
    results = []
    if len(requests) > 6:
        raise ValueError("한 번에 최대 6페이지를 조회하세요.")
    for request in requests:
        if request["bookId"] not in allowed or not isinstance(request["page"], int):
            raise ValueError("연결된 자료와 PDF 페이지를 확인하세요.")
        row = db.execute("SELECT p.*,b.title,b.kind,b.digest,b.path,b.stamp FROM pages p JOIN books b ON b.id=p.book_id WHERE p.book_id=? AND p.page=?",
                         (request["bookId"], request["page"])).fetchone()
        if not row:
            raise ValueError("해당 원문 페이지가 없습니다.")
        stat = Path(row["path"]).stat()
        if row["stamp"] != f"{stat.st_size}:{stat.st_mtime_ns}":
            raise ValueError("로컬 자료가 변경되었습니다. 룰북 색인을 갱신하세요.")
        results.append({"bookId": row["book_id"], "title": row["title"], "kind": row["kind"],
                        "page": row["page"], "digest": row["digest"], "text": row["content"],
                        "pageLabel": "PDF 페이지" if row["path"].lower().endswith(".pdf") else "텍스트 구간"})
    return results


def citation_text(text, join_line_words=False):
    """Normalize layout only, retaining each character's original source span."""
    chars, spans = [], []
    pattern = r"(?<=[A-Za-z])-[ \t]*\r?\n[ \t]*(?=[a-z])|\s+" if join_line_words else r"\s+"
    end = 0
    for match in re.finditer(pattern, text):
        for at in range(end, match.start()):
            chars.append(text[at])
            spans.append((at, at + 1))
        if not match.group().startswith('-'):
            chars.append(' ')
            spans.append(match.span())
        end = match.end()
    for at in range(end, len(text)):
        chars.append(text[at])
        spans.append((at, at + 1))
    return ''.join(chars), spans


def original_citation(content, quote, is_pdf=False):
    if quote in content:
        return quote
    needle, _ = citation_text(quote)
    for join_line_words in ([False, True] if is_pdf else [False]):
        normalized, spans = citation_text(content, join_line_words)
        at = normalized.find(needle)
        if at >= 0:
            # Recover a contiguous original passage, not a newly composed quote.
            return content[spans[at][0]:spans[at + len(needle) - 1][1]]
    return None


def verify_citations(db, citations):
    proofs = []
    for citation in citations:
        r = db.execute("SELECT p.content,b.digest,b.title,b.path,b.stamp FROM pages p JOIN books b ON b.id=p.book_id WHERE book_id=? AND page=?",
                       (citation["bookId"], citation["page"])).fetchone()
        if not r:
            raise ValueError("해당 원문 페이지가 없습니다. 인용의 책 ID와 페이지를 확인하세요.")
        try:
            stat = Path(r["path"]).stat()
        except OSError:
            raise ValueError("로컬 원문 파일을 읽을 수 없습니다. 파일 위치와 접근 권한을 확인하세요.") from None
        if r["stamp"] != f"{stat.st_size}:{stat.st_mtime_ns}":
            raise ValueError("로컬 자료가 변경되었습니다. 룰북 색인을 갱신하세요.")
        quote = citation.get("quote", "")
        if not isinstance(quote, str) or not quote.strip() or len(quote.strip()) > 500:
            raise ValueError("인용문은 1~500자의 원문 구간이어야 합니다.")
        original = original_citation(r["content"], quote.strip(), r["path"].lower().endswith('.pdf'))
        if original is None:
            raise ValueError(f"인용 내용이 원문과 일치하지 않습니다. 책과 페이지 및 인용문을 확인하세요. (페이지 {citation['page']})")
        if len(original) > 500:
            raise ValueError("원문 형식을 복원한 인용이 500자를 초과합니다. 더 짧은 원문 구간을 인용하세요.")
        proofs.append({**citation, "quote": original, "title": r["title"], "digest": r["digest"]})
    return proofs


def main():
    args = json.load(sys.stdin)
    db = connect(args["database"])
    try:
        op = args["op"]
        if op == "index":
            index(db, args["roots"], args.get('strict', False))
            emit({"books": catalog(db, args.get("roots"))})
        elif op == 'backup':
            with sqlite3.connect(args['destination']) as target:
                db.backup(target)
            emit({'ok': True})
        elif op == 'needsIndex':
            emit({'needed': needs_index(db, args['roots'])})
        elif op == "catalog":
            emit({"books": catalog(db, args.get("roots"))})
        elif op == "search":
            allowed = {b["id"] for b in catalog(db, args.get("roots"))}
            emit({"excerpts": search(db, [i for i in args["bookIds"] if i in allowed], args["queries"])})
        elif op == "pages":
            allowed = {b["id"] for b in catalog(db, args.get("roots"))}
            emit({"excerpts": read_pages(db, args["pages"], allowed)})
        elif op == "verify":
            emit({"citations": verify_citations(db, args["citations"])})
        else:
            raise ValueError("지원하지 않는 자료 작업입니다.")
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"error": str(error)})
        sys.exit(1)
