# mapeo-migrate 

Commandline tool for mapeo migrating databases from older formats to the
latest.

## Usage

```
node index.js /path/to/datafile.mapeosinangoe output
```

Where `datafile.mapeosinangoe` is an osm-p2p-syncfile, and `output` is an
output directory.

Produces `old` which is the old database, and `output`, which is a kappa-osm
and media folder.

Run the tests to see if they're the same:

```
node test.js old/ output/
```

## License

MIT

