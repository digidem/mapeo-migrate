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
  'observedBy',
  'links'
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

module.exports = {
  transformOldObservation: transformOldObservation
}
