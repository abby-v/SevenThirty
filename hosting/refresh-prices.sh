#!/usr/bin/env bash
# For hosting where you have a shell and cron (a Linux VM, or cPanel with SSH and Python 3.9+).
# Writes fresh prices straight into the live site's data folder.
#
# Install:
#   1. Upload the contents of site/ to your web root (for example ~/public_html).
#   2. Upload pipeline/fetch_prices.py and this script anywhere outside the web root, e.g. ~/seventhirty/.
#   3. Edit SITE_DATA below, then: chmod +x ~/seventhirty/refresh-prices.sh
#   4. crontab -e and add (06:00 GMT every day):
#        CRON_TZ=UTC
#        0 6 * * * $HOME/seventhirty/refresh-prices.sh >> $HOME/seventhirty/refresh.log 2>&1
#      If your cron doesn't support CRON_TZ, check the server time zone with `date` and adjust the hour.
#      In cPanel: Cron Jobs → Common settings "Once per day", set minute 0 and the hour that is 06:00 UTC.

set -euo pipefail
SITE_DATA="${SITE_DATA:-$HOME/public_html/data}"
PRICE_REGIONS="${PRICE_REGIONS:-uksouth ukwest northeurope westeurope}"
CATALOGUE_REGIONS="${CATALOGUE_REGIONS:-uksouth ukwest}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== $(date -u '+%F %T') UTC: refreshing SevenThirty prices"
python3 "$HERE/fetch_prices.py" --site-data "$SITE_DATA" --catalog-regions "$CATALOGUE_REGIONS" $PRICE_REGIONS
echo "== done"
