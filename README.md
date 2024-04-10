# vCloud Director Rancher Node Driver UI

add vcd driver <b>as YAML to local cluster (with rancher)</b> it's important!
```yaml
apiVersion: management.cattle.io/v3
kind: NodeDriver
metadata:
  annotations:
    privateCredentialFields: password,username,href,org,vdc,vappName
  name: vcd
spec:
  active: true
  addCloudCredential: false
  builtin: false
  checksum: ''
  description: ''
  displayName: vcd
  externalId: ''
  uiUrl: ''
  url: https://github.com/DimKush/docker-driver-vcd/releases/download/0.1.1/docker-machine-driver-vcd-linux-amd64.tgz
```
add http helm to local cluster https://negashev.github.io/rancher-vcloud-director-node-driver-ui-plugin

![Cloud](cloud-credential.png?raw=true "Cloud")

![Machine](machine-config.png?raw=true "Machine")

fix for nginx ingress 502 (annotation for rancher ingress)
```    
nginx.ingress.kubernetes.io/proxy-buffer-size: "128k"
```
