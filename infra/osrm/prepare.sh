#!/bin/sh
set -eu

if [ ! -f /data/region.osm.pbf ]; then
  echo "ERROR: /data/region.osm.pbf not found."
  echo "Put the file into: infra/osrm_data/region.osm.pbf"
  exit 1
fi

echo "[1/3] Extracting..."
osrm-extract -p /opt/car.lua /data/region.osm.pbf

echo "[2/3] Contracting (CH)..."
osrm-contract /data/region.osrm

echo "[3/3] Renaming to map.osrm..."
mv -f /data/region.osrm /data/map.osrm || true
for f in /data/region.osrm.*; do
  [ -e "$f" ] || continue
  mv -f "$f" "/data/map.osrm.${f##*.}"
done

echo "OSRM data prepared successfully."