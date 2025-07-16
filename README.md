# FeedWatcher

FeedWatcher is a web application to follow online resources like RSS feeds.

![](docs/images/screenshot_list.png?raw=true)

# Philosophy

This project is an open source application published on GitHub.

The preferred deployment format of the application is a container (e.g., Docker and/or Kubernetes). The application is published as a single container image that contains both the server and web UI of the application. No external database is needed, just an external volume. The goal is to have an application as self-contained, light, and fast to deploy as possible.

The main use case for the application is to subscribe to RSS feeds. But because support for RSS is not universal, the application is designed to be extendable to other kinds of resources. The idea is to be able to add modules (called "processors" in the application). The repository ships some default modules by default, but during deployment you can add your own private modules and the application will make use of them automatically. The modules are only required to be put in a specific folder and follow some basic standards.

# Deployment

FeedWatcher is designed to be deployed as a container.

- The Docker image is: `didierhoarau/feedwatcher` [https://hub.docker.com/r/didierhoarau/feedwatcher](https://hub.docker.com/r/didierhoarau/feedwatcher)
- This image exposes port `8080`
- The volume is located at `/data`

## Docker

You can, for example, run the following command to run FeedWatcher in Docker:

```bash
mkdir -p data
docker run --name feedwatcher -p 8080:8080 -v "$(pwd)/data:/data" -d didierhoarau/feedwatcher
```

## Kubernetes

The following manifest can be used to deploy in Kubernetes:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feedwatcher
  labels:
    app: feedwatcher
spec:
  replicas: 1
  selector:
    matchLabels:
      app: feedwatcher
  template:
    metadata:
      labels:
        app: feedwatcher
    spec:
      containers:
        - image: feedwatcher
          name: feedwatcher
          resources:
            limits:
              memory: 500Mi
              cpu: 1
            requests:
              memory: 200Mi
              cpu: 100m
          volumeMounts:
            - mountPath: /data
              name: pod-volume
          imagePullPolicy: Always
          readinessProbe:
            httpGet:
              path: /api/status
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
      volumes:
        - name: pod-volume
          persistentVolumeClaim:
            claimName: feedwatcher
---
apiVersion: v1
kind: Service
metadata:
  name: feedwatcher
spec:
  ports:
    - name: tcp
      port: 8080
      targetPort: 8080
  selector:
    app: feedwatcher
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: feedwatcher
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

Check the [docs/deployments](docs/deployments) for more examples of deployments.

# Development

If you want to extend the application with your own Processors: [docs/processors](docs/processors)
