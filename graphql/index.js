const GCM = require('graphql-compose-mongoose');
const mongoose = require("mongoose");
const GC = require('graphql-compose');

// GeoJSON schema:
const GeoLocationSchema = new mongoose.Schema({
  type: {type:String, required: true},
  coordinates: {type:[Number], required: true}
});

var Point = mongoose.model("GeoLocation", GeoLocationSchema);
GCM.composeWithMongoose(Point, {});

// The Type Composer schema comes from this mongoose schema:
var PlaceSchema = new mongoose.Schema({
  info: {type:String, required: true},
  location: {type: GeoLocationSchema, required:true}
},
 { timestamps: true }
);

// index for searching based on gps ball coordinates, which must be woken up with the init() function
PlaceSchema.index({ location: "2dsphere" });
var Place = mongoose.model("Place", PlaceSchema);
const PlaceTC = GCM.composeWithMongoose(Place, {});

// Search based on location and distance doesn't seem to be available in the 
// graphql-compose-mongoose package, so a custom-resolver is added for the search
PlaceTC.addResolver({
  name: 'find',
  kind: 'query',
  args: {
    location: '[Float]',
    distance: 'Float'
  },
  type: PlaceTC.getResolver('findMany').getType(),
  resolve: ({ _, args, context, info }) => {
    Place.init();                         // init(): must be for the 2dsphere index, otherwise "index does not found" will be thrown.
    var query = Place.find({              // Mongoose geospatial - search.
      location: {                         
       $near: {
        $maxDistance: args.distance,
        $geometry: {
         type: "Point",
         coordinates: [args.location[0], args.location[1]]
        }
       }
      }
     }).find((error, results) => {
      if (error) console.log(error);
        console.log(JSON.stringify(results, 0, 2));
     });
     return query.exec();                // this is how this custom resolver is made to enter the return value into 
  }                                      // the same data stream as generic resolvers and thus the client gets the 
                                         // result of the search. Just "return query;" does not work.
});

// So GraphQL resolvers are created like this:
GC.schemaComposer.Query.addFields({
  count: PlaceTC.getResolver('count'),
  find: PlaceTC.getResolver('find') // in order to make the custom resolver visible, we have to declare it here
});

 // This creates a GraphQL resolver for adding a location. All CRUD methods can be found 
 // for defined mongoose schemas and more. Here, the 'createOne' 
 // keyword has been used to create an add procedure for one place.
GC.schemaComposer.Mutation.addFields({
  add: PlaceTC.getResolver('createOne'),
});

const graphqlSchema = GC.schemaComposer.buildSchema();
module.exports = graphqlSchema;
