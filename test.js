var OldOsmdb = require('osm-p2p')
var path = require('path')
var Mapeo = require('@mapeo/core')
var collect = require('collect-stream')

var mapping = require('./mapping.json')
var backwardsMap = swap(mapping)
var OsmKappa = require('./kappa.js')

module.exports = main

function main (oldPath, kappaPath) {
  var osm = OldOsmdb(path.join(oldPath, 'data'))
  var mapeo = new Mapeo(OsmKappa(path.join(kappaPath, 'data')))

  console.log(Object.keys(mapping).length)
  collect(osm.log.createReadStream(), function (err, data) {
    if (err) throw err
    console.log('total hyperlog entries', data.length)
    console.log('total kappa entries', mapeo.osm.core._logs.feeds()[0].length)

    osm.query([[-Infinity, Infinity], [-Infinity, Infinity]], function (err, oldData) {
      if (err) throw err
      mapeo.osm.query([-Infinity, -Infinity, Infinity, Infinity], function (err, newData) {
        if (err) throw err
        console.log('old:', oldData.length)
        console.log('new:', newData.length)
        newData.forEach(function (d) {
          var oldVersion = backwardsMap[d.version]
          osm.getByVersion(oldVersion, function (err, node) {
            if (err) throw err
            if (!node) throw new Error('Node not found:', d)
          })
        })
      })
    })
  })
}

function swap (json) {
  var ret = {}
  for (var key in json) {
    ret[json[key]] = key
  }
  return ret
}

main.apply(null, process.argv.slice(2))
