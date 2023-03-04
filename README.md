# FeedWatcher

FeedWatcher is a web application to follow online resources like RSS feeds.

![](docs/images/screenshot_list.png?raw=true)

# Philosophy

This project is an open source application published on GitHub.

The preferred deployment format of the application is a Container. (eg: Docker and/or Kubernetes). The application is published as a single container image that contain both the server and web UI of the application. No external database is needed, just an external volume. The goal is to have an application as self contained, light and fast to deploy as possible.

The main use case for the application is to subscribe to RSS feeds. But because support for RSS is not universal, the application is designed to be extendable to other kind of resources. The idea is to be able to add modules (called "processors" in the application). The repository ships some default modules by default but during deployment you can add your own private modules and the application will make use of them automatically. The modules are only required to be put in a specific folder and follow some basic standards.

# Deployment

FeedWatcher is designed to be deployed as a container.

- The Docker image is: `didierhoarau/feedwatcher` [https://hub.docker.com/r/didierhoarau/feedwatcher]
- This image exposes port `8080`
- The volume is located in `/data`

You can for example run the following command to run feedwatcher in docker:

```bash
mkdir -p data
docker run --name feedwatcher -p 8080:8080 -v "$(pwd)/data:/data" -d didierhoarau/feedwatcher
```

Check the [docs/deployments](docs/deployments) for more examples of deployments.
