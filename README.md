# mapeo-migrate 

Commandline tool for mapeo migrating databases from the older format to the
latest.

## Migrate from osm-p2p-db to kappa-osm

```
npm run migrate /path/to/datafile.mapeosinangoe output/
``` 

Where `datafile.mapeosinangoe` is an [osm-p2p-syncfile](https://github.com/digidem/osm-p2p-syncfile), and `output/` is the output directory.

Creates two directories: 

  * `old` which is the old database
  * `output`, which contains  `data` and `media` directory.

## Fix media paths

The migration script assumes [safe-fs-blob-store](https://github.com/noffle/safe-fs-blob-store) for media, and mapeo-migrate
doesn't add dir prefixes (e.g. media/fo/foo.jpg instead of media/foo.jpg)

To fix the media paths so they are supported by `@mapeo/core`, run:

```
./update_media_paths.sh output
```


## Test the migration

Run the tests to see if they're the same:

```
npm run test output/
```

Where `output/` is the same directory you specified before in the `npm run
migrate` script.

## Create osm-p2p-syncfile

Install `osm-p2p-syncfile` globally:

```
npm install -g osm-p2p-syncfile
```

Then to create the syncfile: 

```
osm-p2p-syncfile init kappa.mapeodata output
```

Where `output/` is the same directory you created before with the `migrate`
script.

## License

MIT

