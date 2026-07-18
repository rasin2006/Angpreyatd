#!/usr/bin/bash

echo running...
#./kiosk_browser.sh &
echo "done runnig ./kiosk_browser.sh"

sleep 2

echo "Starting http://nfc.local server..."
konsole --new-tab -e bash -c "echo 'nimet' | sudo -S sudo /home/nimet/myenv/bin/python /home/nimet/Project/app.py; echo 'Server Started at http://nfc.loca'"
