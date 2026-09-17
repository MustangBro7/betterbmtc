# Transit database license

The bundled derived BMTC database is available under the Open Database License (ODbL) v1.0:
https://opendatacommons.org/licenses/odbl/1-0/

Source: https://github.com/Vonter/bmtc-gtfs
Source data derived from the Namma BMTC mobile application.

The database's `provenance` field contains the upstream commit, publication date and import date. Adaptations select/normalize stops and directional route patterns into a compact schema. No live vehicle locations or invented schedules are included.

The full derived database is supplied in backend/src/static-data.json and publicly downloadable from the application at /data/bmtc-static.json. This license applies to the database, not the separately authored application code.
