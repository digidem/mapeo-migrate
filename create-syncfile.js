// creates a syncfile from a directory
var path = require('path')
var Blob = require('safe-fs-blob-store')
var Mapeo = require('@mapeo/core')

var kappa = require('./kappa')


var dir = process.argv[2]
var outputFilename = process.argv[3]

var db = kappa(path.join(dir, 'data'))
var blobs = Blob(path.join(dir, 'media'))
var mapeo = new Mapeo(db, blobs)

var emitter = mapeo.sync.replicateFromFile(outputFilename)
emitter.on('progress', function (progress) {
  console.log('progress', progress)
})
emitter.on('error', function (err) {
  throw err
})
emitter.on('end', function () {
  console.log('done')
})
