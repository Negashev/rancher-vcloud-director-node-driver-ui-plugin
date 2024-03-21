import MachineTemplate from '@shell/models/rke-machine.cattle.io.machinetemplate';

export default class VcdMachineTemplate extends MachineTemplate {

  get provider() {
    return 'vcd';
  }

  get providerLocation() {
    return this.spec.template.spec.vdc;
  }

  get providerSize() {
    return this.spec.template.spec.cpuCount + 'x' + (this.spec.template.spec.memorySize / 1024).toFixed(1) + 'x' + (this.spec.template.spec.diskSize / 1024).toFixed(1);
  }
}