var path = require('path')
var OldOsmdb = require('osm-p2p')
var Mapeo = require('@mapeo/core')
var geojson = require('osm-p2p-geojson')
var Settings = require('@mapeo/settings')
var collect = require('collect-stream')
var os = require('os')
var Syncfile = require('osm-p2p-syncfile')
var mkdirp = require('mkdirp')
var createMediaReplicationStream = require('blob-store-replication-stream')
var blob = require('safe-fs-blob-store')

var OsmKappa = require('./kappa.js')
var exportGeojson = require('./lib/export-geojson')

/*
 * Converts mapeo data from hyperlog to kappa-core
 *
 *  $ migrate <syncfile> <settings> <output-dir>
 *
 *  Example:
 *  $ migrate sinangoe.mapeodata sinangoe-6.0.mapeosettings output/
 */

module.exports = main

function replicate (stream1, stream2, cb) {
  // Taken from syncfile README. Q: Can we use pump?
  stream1.on('end', done)
  stream1.on('error', done)
  stream2.on('end', done)
  stream2.on('error', done)

  stream1.pipe(stream2).pipe(stream1)

  var pending = 2
  var error
  function done (err) {
    error = err || error
    if (!--pending) cb(err)
  }
}

function unpackSyncfile (filename, db, cb) {
  var tmp = os.tmpdir()
  var syncfile = new Syncfile(filename, tmp)
  db.osm.ready(function () {
    syncfile.ready(function () {
      var rs = syncfile.osm.log.replicate()
      var ws = db.osm.log.replicate()

      var m1 = createMediaReplicationStream(syncfile.media)
      var m2 = createMediaReplicationStream(db.media)
      var pending = 2

      var error
      function fin (err) {
        if (err) error = err
        if (!--pending) cb(error)
      }

      replicate(rs, ws, fin)
      replicate(m1, m2, fin)
    })
  })
}

function main (osmSyncfile, settingsFile, output) {
  var oldPath = path.join(__dirname, 'old')

  console.log(`[ACTION] Unpacking syncfile ${osmSyncfile}`)
  var db = {
    osm: OldOsmdb(path.join(oldPath, 'data')),
    // media is the same as before, so lets just unpack directly to output
    media: blob(path.join(output, 'media'))
  }
  unpackSyncfile(osmSyncfile, db, function (err) {
    if (err) throw err
    console.log(`Complete`)

    console.log(`[ACTION] Importing settings ${settingsFile}`)
    var settings = new Settings(oldPath)
    settings.importSettings(settingsFile, function (err) {
      if (err) throw err
      console.log(`Complete`)

      // this makes me think mapeo-core should know about presets
      var presets = settings.getSettings('presets')

      db.osm.close(function (err) {
        if (err) throw err
        // TODO: do we need to re-open?
        db.osm = OldOsmdb(path.join(oldPath, 'data'))
        mkdirp(output, function (err) {
          if (err) throw err
          console.log(`[ACTION] Readying databases`)
          var mapeo = new Mapeo(OsmKappa(output))
          db.osm.ready(function () {
            console.log(`Complete`)
            convertOsm(db.osm, mapeo, presets)
          })
        })
      })
    })
  })
}

function convertOsm (oldOsm, mapeo, presets) {
  console.log(`[ACTION] Converting observations`)
  var rs = oldOsm.kv.createReadStream()
  rs.on('data', function (data) {
    var val = data.value && data.value.v
    if (val && val.type === 'observation') {
      console.log('Creating observation', val)
      mapeo.observationCreate(transformOldObservation(val), function (err) {
        if (err) throw err
      })
    }
  })
  rs.on('error', function (err) {
    console.log(`[ERROR] In oldOsm.kv.createReadStream`)
    if (err) throw err
  })
  rs.on('end', function () {
    console.log(`Complete`)
    var stream = exportGeojson(oldOsm, presets)
    console.log(`Exporting GeoJson`)
    collect(stream, function (err, data) {
      if (err) throw err
      var fc = JSON.parse(data)
      console.log('[STATUS] Got feature collection', fc)
      var importer = geojson.importer(oldOsm)
      console.log(`[ACTION] Importing Feature Collection`)
      importer.importFeatureCollection(fc, function (err) {
        if (err) throw err
        console.log('Complete')
      })
      importer.on('import', function (index, length) {
        console.log(`[STATUS] imported ${index}/${length}`)
      })
      importer.on('error', function (err) {
        if (err) throw err
      })
    })
  })
}

// Top-level props that can be modified by the user/client
var USER_UPDATABLE_PROPS = [
  'lon',
  'lat',
  'attachments',
  'tags',
  'ref',
  'metadata',
  'fields',
  'schemaVersion'
]

// All valid top-level props
var TOP_LEVEL_PROPS = USER_UPDATABLE_PROPS.concat([
  'created_at',
  'timestamp',
  'id',
  'version',
  'type'
])

// Props from old versions of mapeo-mobile that we can discard
var SKIP_OLD_PROPS = [
  'created_at_timestamp',
  'link',
  'device_id',
  'observedBy'
]

// Transform an observation from Sinangoe version of MM to the current format
function transformObservationSchema1 (obs) {
  var newObs = { tags: {} }
  Object.keys(obs).forEach(function (prop) {
    if (prop === 'attachments') {
      // Attachments has changed from array of strings to array of objects
      newObs.attachments = (obs.attachments || []).map(a => {
        if (typeof a !== 'string') return a
        return { id: a }
      })
    } else if (prop === 'fields') {
      // fields.answer should be a tag
      newObs.fields = obs.fields || []
      newObs.fields.forEach(f => {
        if (!f || !f.answer || !f.id) return
        newObs.tags[f.id] = f.answer
      })
    } else if (SKIP_OLD_PROPS.indexOf(prop) > -1) {
      // just ignore unused old props
    } else if (TOP_LEVEL_PROPS.indexOf(prop) > -1) {
      // Copy across valid top-level props
      newObs[prop] = obs[prop]
    } else if (prop === 'created') {
      // created is changed to created_at
      newObs.created_at = obs.created
    } else {
      newObs.tags[prop] = obs[prop]
    }
  })
  return newObs
}

// Transform an observation from ECA version of MM to the current format
function transformObservationSchema2 (obs) {
  var newObs = Object.assign({}, obs, {tags: {}})
  Object.keys(obs.tags || {}).forEach(function (prop) {
    if (prop === 'fields') {
      newObs.fields = obs.tags.fields
    } else if (prop === 'created') newObs.created_at = obs.tags.created
    else newObs.tags[prop] = obs.tags[prop]
  })
  return newObs
}

// Get the schema version of the observation
// Prior to schema 3 we had two beta testing schemas in the wild
// which did not have a schemaVersion property
function getSchemaVersion (obs) {
  if (obs.schemaVersion) return obs.schemaVersion
  if (typeof obs.device_id === 'string' &&
    typeof obs.created === 'string' &&
    typeof obs.tags === 'undefined') return 1
  if (typeof obs.created_at === 'undefined' &&
    typeof obs.tags !== 'undefined' &&
    typeof obs.tags.created === 'string') return 2
  return null
}

function transformOldObservation (obs) {
  switch (getSchemaVersion(obs)) {
    case 1:
      return transformObservationSchema1(obs)
    case 2:
      return transformObservationSchema2(obs)
    default:
      return obs
  }
}

main.apply(null, process.argv.slice(2))
