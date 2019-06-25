var hypercore = require('hypercore')

var core = hypercore(process.argv[2], { valueEncoding: 'json' })
core.get(Number(process.argv[3]), console.log)
