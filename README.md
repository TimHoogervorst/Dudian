<h1 align="center">
  <img src="docs/dudian-logo.png" alt="Dudian (读点)" width="300">
</h1>

I built Dudian to improve my Chinese. It’s a small app I vibe-coded between other projects to get a reading routine that works for me. I read short stories about Baobao, tap unfamiliar words for their meanings, and practice them again later.

## Run with Docker

With Git and Docker Compose installed, run:

```sh
git clone https://github.com/TimHoogervorst/Dudian.git
cd Dudian
docker compose up -d --build
```

Open [Dudian](http://localhost:3000) to try the included story. To generate your own, choose **Settings → Continue with ChatGPT** on the computer running Docker. [Connection and cover artwork setup](docs/chatgpt-connection.md)

To stop the app, run `docker compose down`. Your stories and progress stay in the Docker volume.

[MIT license](LICENSE) · [Dictionary and vocabulary credits](data/NOTICE.md)
