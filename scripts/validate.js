var validate = require('/home/sww/forks/mapeo-schema').validateObservation
var ndjson = require('ndjson')

process.stdin.pipe(ndjson.parse())
  .on('data', function (node) {
    if (node.type !== 'observation') return
    node.version = 'tmp'
    console.log(node.id, validate(node), validate.errors)
  })

