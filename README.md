# Yu-Gi-Oh! Card Gallery

A lightweight static site that displays Yu-Gi-Oh! cards in a responsive image grid with:

Live site: https://momo5502.github.io/yugioh/

- infinite scrolling
- search
- filtering
- sorting
- click-to-open card details

## Data source

Card data is loaded remotely in the browser from the YGOJSON project:

- Repository: https://github.com/iconmaster5326/YGOJSON
- Aggregate cards JSON: https://raw.githubusercontent.com/iconmaster5326/YGOJSON/v1/aggregate/cards.json

The app downloads and parses that large JSON file in a Web Worker so the UI stays responsive.
