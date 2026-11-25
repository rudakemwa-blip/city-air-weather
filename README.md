# City Air & Weather Compare

A web app that lets you add several cities and compare **temperature, humidity, wind and air quality (AQI)** side by side. Useful for choosing where to travel, run outdoors, or simply checking whether the air is safe to breathe. Deployed on two web servers behind a load balancer.

- **Demo video (max 2 min):** <>
- **Deployed site (load balancer):** http://<http://3.8.122.59/>
- **Login:** none required

## Features
- Add any city; data is fetched live (weather + air quality)
- **Sort** by temperature, humidity, air quality or name
- **Filter** by minimum temperature and **search** added cities by name
- AQI colour badges (Good to Very Poor), PM2.5 values, weather icons
- Cities persist in your browser (localStorage)
- **Error handling:** empty or invalid input, unknown city, API downtime or timeout, rate limit, bad API key, network failure, all with clear on-screen messages
- **Caching:** server caches each city for 10 minutes to cut API calls and latency
- **Security:** API key stays on the server (`.env`, git-ignored); input validated server-side; the frontend never uses `innerHTML` (XSS-safe); path traversal blocked
- Footer shows which backend served the page (useful for the load balancer demo)

## Tech
Node.js 18+ (no npm dependencies), plain HTML/CSS/JavaScript, Nginx.

## API used
[OpenWeatherMap](https://openweathermap.org/) by OpenWeather Ltd. Endpoints:
- [Geocoding API](https://openweathermap.org/api/geocoding-api)
- [Current Weather API](https://openweathermap.org/current)
- [Air Pollution API](https://openweathermap.org/api/air-pollution)

Free tier: 60 calls/minute. Weather icons are from OpenWeatherMap. Thank you to the OpenWeather team.

## Run locally
```bash
git clone https://github.com/<YOUR_USER>/city-air-weather.git
cd city-air-weather
cp .env.example .env      # then edit .env and set OWM_KEY=your_key
npm start                 # or: node server.js
```
Open http://localhost:3000. New API keys can take up to a couple of hours to activate.

## Deploy to Web01 and Web02
Repeat on **each** server (replace the IP and user):
```bash
ssh <user>@<WEB_IP>
sudo mkdir -p /var/www/app && sudo nano /var/www/app/.env     # add: OWM_KEY=your_key
curl -fsSLO https://raw.githubusercontent.com/<YOUR_USER>/city-air-weather/main/deploy/deploy.sh
sudo bash deploy.sh https://github.com/<YOUR_USER>/city-air-weather.git
```
What `deploy.sh` does: installs Node 20 + Nginx, clones the repo to `/var/www/app`, keeps your `.env`, installs the systemd service (`deploy/app.service`, auto-restart on crash), installs the Nginx reverse proxy (`deploy/nginx-app.conf`, port 80 to Node on 3000) and checks `/api/health`.

Verify on each server: `curl http://localhost/api/health` then open `http://<WEB_IP>` in a browser.

## Configure the load balancer (Lb01)
```bash
ssh <user>@<LB01_IP>
sudo apt-get update && sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/default    # paste deploy/lb-nginx.conf, replace WEB01_IP / WEB02_IP
sudo nginx -t && sudo systemctl reload nginx
```
How it works: an Nginx `upstream` block lists both web servers (round robin by default). `max_fails`/`fail_timeout` and `proxy_next_upstream` take a failed server out of rotation and retry the request on the other one. The `X-Served-By` response header reveals which server answered.

## Test load balancing
```bash
for i in $(seq 1 6); do curl -sI http://<LB01_IP> | grep -i x-served-by; done
```
Expected: the two web server addresses alternate. In the browser the footer ("Served by") shows the server hostname after you add a city. To test failover, run `sudo systemctl stop nginx` on Web01 and confirm the site still works through Lb01, then start it again.

## Challenges and how I solved them
- <CHALLENGE 1>
- <CHALLENGE 2>
- <CHALLENGE 3>

## Credits
- [OpenWeatherMap](https://openweathermap.org/) for the weather, geocoding and air pollution APIs and icons
- [Nginx](https://nginx.org/) and [Node.js](https://nodejs.org/)
-
