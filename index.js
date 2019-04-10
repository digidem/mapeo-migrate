var path = require('path')
var through = require('through2')
var OldOsmdb = require('osm-p2p')
var Mapeo = require('@mapeo/core')
var fs = require('fs')
var pump = require('pump')
var gunzip = require('gunzip-maybe')
var tar = require('tar-fs')
var mkdirp = require('mkdirp')

var OsmKappa = require('./kappa')
var schema = require('./schema')

/*
 * Converts mapeo data from hyperlog to kappa-core
 *
 *  $ migrate <syncfile> <output-dir>
 *
 *  Example:
 *  $ migrate sinangoe.mapeodata output/
 */

module.exports = main

function unzip (filename, dir, cb) {
  return pump(fs.createReadStream(filename), gunzip(), tar.extract(dir), cb)
}

function unpackSyncfile (filename, dir, cb) {
  unzip(filename, dir, function (err) {
    if (err) return cb(err)
    unzip(path.join(dir, 'osm-p2p-db.tar'), path.join(dir, 'data'), cb)
  })
}

function main (osmSyncfile, output) {
  var oldPath = path.join(__dirname, 'old')

  var datadir = path.join(output, 'data')
  var media = path.join(output, 'media')

  mkdirp.sync(oldPath)
  mkdirp.sync(datadir)
  mkdirp.sync(media)

  console.log(`[ACTION] Unpacking syncfile ${osmSyncfile}`)
  unpackSyncfile(osmSyncfile, oldPath, function (err) {
    if (err) throw err
    console.log(`Complete`)
    console.log(`[ACTION] Readying databases`)
    var osm = OldOsmdb(path.join(oldPath, 'data'))
    var mapeo = new Mapeo(OsmKappa(datadir))
    osm.ready(function () {
      console.log(`Complete`)
      fs.renameSync(path.join(oldPath, 'original'), path.join(media, 'original'))
      fs.renameSync(path.join(oldPath, 'thumbnail'), path.join(media, 'thumbnail'))
      convertOsm(osm, mapeo)
    })
  })
}

var testing = '0783992b19cf572120d81885a2d12a717dc7f6afc41bb93ccd443b4f2b2a3f23'
var testingId = '7040888349604762768'

function convertOsm (oldOsm, mapeo) {
  console.log(`[ACTION] Converting open street map`)
  var map = {}
  var rs = oldOsm.log.createReadStream()
  var convertStream = through.obj(function (data, enc, next) {
    var oldVersion = data.key
    var id = data.value.k
    if (id === testingId) console.log('read testing value from old osm', data)
    var element = data.value && data.value.v
    var links = data.links ? data.links.map((old) => map[old]) : []

    function updateVersion (node) {
      if (Array.isArray(node)) map[oldVersion] = node[0].version
      else map[oldVersion] = node.version
    }

    if (!element && data.value.d) {
      var value = Object.assign(data.value, {links})
      // console.log('deleting', value)
      if (value.links[0] === undefined) {
        console.log('got value.links undefined', data)
      }
      return mapeo.osm.batch([{type: 'del', id, value}], function (err, node) {
        if (err) throw err
        // console.log('Modified', node, map)
        updateVersion(node)
        next()
      })
    }

    mapeo.osm.get(id, function (err, node) {
      if (id === testingId) console.log('got this from kappa-osm', err, node)
      if (err) throw err
      var value = Object.assign(element, {links})

      var done = function (err, node) {
        if (err) throw err
        // console.log('Created', node)
        if (Array.isArray(node)) map[oldVersion] = node[0].version
        else map[oldVersion] = node.version
        next()
      }

      if (id === testingId) console.log('creating', id, value)
      if (value.type === 'observation') {
        var obs = schema.transformOldObservation(value)
        obs.id = id
        // console.log('Creating observation', obs)
        mapeo.observationCreate(obs, done)
      } else {
        // console.log('Creating', id, value)
        mapeo.osm.batch([{type: 'put', id, value}], done)
      }
    })
  })
  pump(rs, convertStream, function (err) {
    if (err) {
      console.log(`[ERROR] In oldOsm.log.createReadStream`)
      throw err
    }
    console.log(`Complete`)
  })
}

main.apply(null, process.argv.slice(2))
