const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const s={type:'string'},n={type:'number'},b={type:'boolean'};
const point=object({x:n,y:n}),bounds=object({min:point,max:point});
const list=(items,maxItems)=>({type:'array',items,maxItems});
export const authoredPositionSchema={anyOf:[{type:'null'},point]};
export const spatialGeometrySchema={anyOf:[{type:'null'},object({
 columns:{type:'integer',minimum:4,maximum:40},rows:{type:'integer',minimum:4,maximum:40},unit:n,
 exploration:object({entry:point,sight:n,secondsPerCell:n,
  walls:list(object({id:s,name:s,a:point,b:point,door:b,open:b,locked:b}),80),
  areas:list(object({id:s,name:s,kind:{type:'string',enum:['room','corridor','outdoor']},bounds,description:s}),40),
  covers:list(object({id:s,name:s,bounds,heightYards:n,blocksMovement:b,blocksVision:b,description:s}),40)
 })
})]};
