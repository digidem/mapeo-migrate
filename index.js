var path = require('path')
var through = require('through2')
var OldOsmdb = require('osm-p2p')
var Mapeo = require('@mapeo/core')
var fs = require('fs')
var pump = require('pump')
var gunzip = require('gunzip-maybe')
var tar = require('tar-fs')
var mkdirp = require('mkdirp')
var sharp = require('sharp')

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
  mkdirp.sync(path.join(media, 'preview'))

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

      var pending = 3
      generatePreviewMedia(path.join(media, 'original'), function (err) {
        if (err) throw err
        upgradeMediaPaths(path.join(media, 'original'), fin)
        upgradeMediaPaths(path.join(media, 'preview'), fin)
        upgradeMediaPaths(path.join(media, 'thumbnail'), fin)
      })
      function fin (err) {
        if (err) throw err
        if (!--pending) convertOsm(osm, mapeo)
      }
    })
  })
}

// Opens all path.join(dir, 'original') media files and generates preview-sized
// media for them in path.join(dir, 'preview').
function generatePreviewMedia (dir, cb) {
  var processed = 0

  fs.readdir(dir, function (err, files) {
    if (err) return fin(err)
    ;(function next (n) {
      if (n >= files.length) return fin()
      var name = files[n]
      console.log('starting', name)
      fs.stat(path.join(dir, name), function (err, stat) {
        if (err) return fin(err)
        if (stat.isDirectory()) return next(n + 1)
        var outname = path.join(path.join(dir, '..', 'preview', name))
        console.log('resizing', name)
        sharp(path.join(dir, name))
          .resize({ width: 1200, height: 1200, fit: 'inside' })
          .jpeg({quality: 30})
          .toFile(outname, function (err) {
            console.log('resized')
            processed++
            if (err) fin(err)
            else next(n + 1)
          })
      })
    })(0)
  })

  function fin (err) {
    console.log('done')
    if (err) cb(err)
    else {
      console.log('Resized', processed, 'original -> preview files.')
      cb()
    }
  }
}

// Updates all media files with path 'dir/foo.jpg' to be prefixed for
// safe-fs-blob-store: 'dir/fo/foo.jpg'
function upgradeMediaPaths (dir, cb) {
  var processed = 0

  fs.readdir(dir, function (err, files) {
    if (err) return fin(err)
    var pending = files.length + 1
    files.forEach(function (name) {
      var subdir = name.substring(0, 2)
      fs.stat(path.join(dir, name), function (err, stat) {
        if (err) return fin(err)
        if (stat.isDirectory()) {
          if (!--pending) fin()
          return
        }
        mkdirp(path.join(dir, subdir), function () {
          fs.rename(path.join(dir, name), path.join(dir, subdir, name), function (err) {
            if (err) return fin(err)
            processed++
            if (!--pending) fin()
          })
        })
      })
    })
    if (!--pending) fin()
  })

  function fin (err) {
    if (err) cb(err)
    else {
      console.log('Fixed paths on', processed, 'media files.')
      cb()
    }
  }
}

function convertOsm (oldOsm, mapeo) {
  console.log(`[ACTION] Converting open street map`)
  var map = {}
  var rs = oldOsm.log.createReadStream()
  var convertStream = through.obj(function (data, enc, next) {
    var oldVersion = data.key
    var id = data.value.k || data.value.d
    var element = data.value && data.value.v
    var links = data.links ? data.links.map((old) => map[old]) : []

    function updateVersion (node) {
      if (Array.isArray(node)) map[oldVersion] = node[0].version
      else map[oldVersion] = node.version
    }

    if (!element && data.value.d) {
      var value = {
        deleted: true,
        links: links
      }
      return mapeo.osm.batch([{type: 'del', id, value}], function (err, node) {
        if (err) throw err
        updateVersion(node)
        next()
      })
    }

    mapeo.osm.get(id, function (err, node) {
      if (err) throw err
      var value = Object.assign(element, {links})

      var done = function (err, node) {
        if (err) throw err
        // console.log('Created', node)
        if (Array.isArray(node)) map[oldVersion] = node[0].version
        else map[oldVersion] = node.version
        next()
      }

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
    console.log()
    if (err) {
      console.log(`[ERROR] In oldOsm.log.createReadStream`)
      throw err
    }
    console.log('Writing mapping.json')
    fs.writeFileSync('mapping.json', JSON.stringify(map, null, 2))
    console.log(`Complete`)
  })
}

main.apply(null, process.argv.slice(2))
