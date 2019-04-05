var path = require('path')
var OldOsmdb = require('osm-p2p')
var Mapeo = require('@mapeo/core')
var geojson = require('osm-p2p-geojson')
var Settings = require('@mapeo/settings')
var collect = require('collect-stream')
var level = require('level')

var OsmKappa = require('./kappa.js')
var exportGeojson = require('./lib/export-geojson')

/*
 * Converts mapeo data from hyperlog to kappa-core
 *
 *  $ migrate <syncfile> <presets file> <output-folder>
 *
 *  Example:
 *  $ migrate sinangoe.mapeodata sinangoe-6.0.mapeosettings output/
 */

module.exports = main

function unpackSyncfile (filename, userDataPath, cb) {
}

function main (osmSyncfile, settingsFile, output) {
  var userDataPath = path.join(__dirname, 'old')

  unpackSyncfile(osmSyncfile, userDataPath, function (err) {
    if (err) throw err

    var settings = new Settings(userDataPath)

    settings.importSettings(settingsFile, function (err) {
      if (err) throw err

      // this makes me think mapeo-core should know about presets
      var presets = settings.getSettings('presets')

      var mapeo = new Mapeo(OsmKappa(output))
      var oldOsm = OldOsmdb(level(path.join(userDataPath, 'old', 'data')))
      convert(oldOsm, mapeo, presets)
    })
  })

}

function convert (oldOsm, mapeo, presets) {
  var rs = oldOsm.kv.createReadStream()
  rs.on('data', function (data) {
    var val = data.value && data.value.v
    if (val && val.type === 'observation') {
      mapeo.observationCreate(transformOldObservation(val), function (err) {
        if (err) throw err
      })
    }
  })
  rs.on('error', function (err) {
    if (err) throw err
  })
  rs.on('end', function () {
    console.log('adding osm data')
    var stream = exportGeojson(oldOsm, presets)
    collect(stream, function (err, data) {
      if (err) throw err
      var fc = JSON.parse(data)
      console.log('Begin importing fc', fc)
      var importer = geojson.importer(oldOsm)
      importer.importFeatureCollection(fc, function (err) {
        if (err) throw err
        console.log('done adding osm data')
      })
      importer.on('import', function (index, length) {
        console.log(`imported ${index}/${length}`)
      })
      importer.on('error', function (err) {
        if (err) throw err
      })
      // TODO: copy media over? Create a syncfile? move the kappa folder into
      // the user data path? should we rename the data folder in mapeo-desktop
      // and mobile so that it doesn't accidentally override the hyperlog data?
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
