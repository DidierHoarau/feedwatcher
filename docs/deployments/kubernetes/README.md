# Deploying with Kubernetes.

In the [feedwatcher] directory, you will find an example of deployment using Yaml files (with Kustomize)

To Launch the application in Kubenetes:

```bash
git clone https://github.com/DidierHoarau/feedwatcher
cd feedwatcher/docs/deployments/kubernetes/feedwatcher
kubectl kustomize . | kubectl apply -f -
```
