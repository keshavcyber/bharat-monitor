# Bharat Monitor

Bharat Monitor is an open-source India intelligence dashboard for viewing national and state-level information in one place. It is inspired by global monitoring dashboards, but focused specifically on India, Indian states, public data, news signals, weather, disasters, economy, and readiness indicators.

The project is maintained by Keshav as the main contributor.

## Features

- Interactive India map with clickable states
- India-wide and state-specific news feeds
- News categories for top news, markets, technology, government, weather, and disaster events
- State profile cards with capital, population, area, literacy, and key tags
- Readiness score with weighted pillars:
  - Economy
  - Infrastructure
  - Health
  - Water and Environment
  - Security and Stability
  - Governance and Welfare
  - Digital and Cyber
  - Human Development
- Live market ticker for India-focused metrics

## Tech Stack

- HTML, CSS, and JavaScript for the frontend
- Node.js for the local web server
- MapLibre GL JS for the interactive map
- GeoJSON state boundaries for India
- RSS/news feeds for live information

## Run Locally

Install dependencies:

```powershell
npm install
```

Start the app:

```powershell
npm start
```

Open:

```text
http://localhost:5173
```

## Deploying To Render

Use these Render settings:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

The app reads Render's `PORT` environment variable automatically, so no extra port setup is needed.

Add this environment variable in Render:

```text
MAPBOX_TOKEN=your_public_mapbox_token
```

Use a Mapbox public token that starts with `pk.`. Do not commit real tokens into GitHub.

## Domain

Planned production domain:

```text
https://bharatmonitor.app
```

After deploying on Render, add `bharatmonitor.app` and `www.bharatmonitor.app` as custom domains in Render, then update your domain DNS records using the values Render provides.

## Project Structure

```text
.
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server.js
├── package.json
└── README.md
```

## Notes

The readiness score is currently an indicative score, not an official government score. It combines baseline profile data, live news signals, and mapped source areas. As more official datasets are connected, the score can become more reliable and data-driven.

## Maintainer

Maintained by Keshav.

## Contributing

Contributions are welcome. For major changes, please open an issue first so the direction can be discussed before implementation.

The maintainer reviews and decides what gets merged into the main project.

## License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.
