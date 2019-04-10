var OldOsmdb = require('osm-p2p')
var path = require('path')
var Mapeo = require('@mapeo/core')
var pump = require('pump')
var through = require('through2')
var tape = require('tape')
var equals = require('deep-equals')

var schema = require('./schema')
var OsmKappa = require('./kappa.js')

module.exports = main

function main (oldPath, kappaPath) {
  var osm = OldOsmdb(path.join(oldPath, 'data'))
  var mapeo = new Mapeo(OsmKappa(path.join(kappaPath), 'data'))
  var rs = osm.queryStream([[-Infinity, Infinity], [-Infinity, Infinity]])
  tape('this is a test', function (t) {
    var check = through.obj(function (raw, enc, next) {
      var elm = schema.transformOldObservation(raw)
      console.log(raw, elm)
      mapeo.osm.get(elm.id, function (err, nodes) {
        t.error(err)
        console.log(nodes)
        var node = nodes[0]
        // t.same(elm.timestamp, node.timestamp)
        // t.same(elm.refs, node.refs)
        if (!equals(elm.tags, node.tags)) console.log(elm, node)
        next()
      })
    })
    pump(rs, check, function (err) {
      t.error(err)
      t.end()
    })
  })
}

main.apply(null, process.argv.slice(2))
