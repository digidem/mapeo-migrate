var OldOsmdb = require('osm-p2p')
var path = require('path')
var fs = require('fs')
var Mapeo = require('@mapeo/core')
var collect = require('collect-stream')

var mapping = require('./mapping.json')
var backwardsMap = swap(mapping)
var OsmKappa = require('./kappa.js')

module.exports = main
var allVersions = {}
var allIds = {}
var duplicateIds = {}
var duplicateVersions = {}

function main (oldPath, kappaPath) {
  var osm = OldOsmdb(path.join(oldPath, 'data'))
  var mapeo = new Mapeo(OsmKappa(path.join(kappaPath, 'data')))

  console.log('Total versions in mapping.json:', Object.keys(mapping).length)
  collect(osm.log.createReadStream(), function (err, data) {
    if (err) throw err
    console.log('total hyperlog entries', data.length)
    console.log('total kappa entries', mapeo.osm.core._logs.feeds()[0].length)

    osm.query([[-Infinity, Infinity], [-Infinity, Infinity]], function (err, oldData) {
      if (err) throw err
      mapeo.osm.query([-Infinity, -Infinity, Infinity, Infinity], function (err, newData) {
        if (err) throw err
        console.log('old query:', oldData.length)
        console.log('new query:', newData.length)

        var d = diff(oldData, newData)
        fs.writeFileSync('diff.json', JSON.stringify(d, null, 2))
        console.log('wrote diff to diff.json')

        newData.forEach(function (d) {
          var oldVersion = backwardsMap[d.version]
          var duplicate = allVersions[d.version]
          if (!duplicate) allVersions[d.version] = [d]
          else {
            duplicate.push(d)
            duplicateVersions[d.version] = duplicate
            console.log('found duplicate versions', Object.keys(duplicateVersions).length)
          }

          duplicate = allIds[d.id]
          if (!duplicate) allIds[d.id] = [d]
          else {
            duplicate.push(d)
            duplicateIds[d.id] = duplicate
            console.log('found duplicate ids', Object.keys(duplicateIds).length)
            fs.writeFileSync('duplicates.json', JSON.stringify(duplicateIds, null, 2))
            console.log('wrote duplicates.json')
          }

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

function diff (prev, next) {
  var res = {
    prevOnly: [],
    nextOnly: []
  }

  var prevIds = {}
  for (var i=0; i < prev.length; i++) {
    var node = prev[i]
    if (prevIds[node.id]) prevIds[node.id].push(node)
    else prevIds[node.id] = [node]
  }

  var nextIds = {}
  for (var i=0; i < next.length; i++) {
    var node = next[i]
    if (nextIds[node.id]) nextIds[node.id].push(node)
    else nextIds[node.id] = [node]

    if (!prevIds[node.id]) {
      res.nextOnly.push(node)
    }
  }

  for (var i=0; i < prev.length; i++) {
    var node = prev[i]

    if (!nextIds[node.id]) {
      res.prevOnly.push(node)
    }
  }

  return res
}

main.apply(null, process.argv.slice(2))
