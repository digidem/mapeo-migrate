var OldOsmdb = require('osm-p2p')
var path = require('path')
var Mapeo = require('@mapeo/core')

var OsmKappa = require('./kappa.js')

module.exports = main

function main (oldPath, kappaPath) {
  var osm = OldOsmdb(path.join(oldPath, 'data'))
  var mapeo = new Mapeo(OsmKappa(path.join(kappaPath, 'data')))
  osm.query([[-Infinity, Infinity], [-Infinity, Infinity]], function (err, oldData) {
    if (err) throw err
    mapeo.osm.query([-Infinity, -Infinity, Infinity, Infinity], function (err, newData) {
      if (err) throw err
      console.log(oldData.length, newData.length)
    })
  })
}

main.apply(null, process.argv.slice(2))
