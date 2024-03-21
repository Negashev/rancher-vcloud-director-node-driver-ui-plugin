<script>
import Loading from '@shell/components/Loading';
import { Banner } from '@components/Banner';
import CreateEditView from '@shell/mixins/create-edit-view';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import UnitInput from '@shell/components/form/UnitInput';
import Checkbox from '@components/Form/Checkbox/Checkbox';
import { LabeledInput } from '@components/Form/LabeledInput';
import { NORMAN, SECRET } from '@shell/config/types';
import { stringify } from '@shell/utils/error';
import { _VIEW } from '@shell/config/query-params';
import { Vcd } from '../vcd.ts';

function initOptions() {
  return {
    options:  [],
    selected: null,
    busy:     false,
    enabled:  false,
  };
}

export default {
  components: {
    Banner, Loading, LabeledInput, UnitInput, LabeledSelect, Checkbox
  },

  mixins: [CreateEditView],

  props: {
    uuid: {
      type:     String,
      required: true,
    },

    cluster: {
      type:    Object,
      default: () => ({})
    },

    credentialId: {
      type:     String,
      required: true,
    },

    disabled: {
      type:    Boolean,
      default: false
    },

    busy: {
      type:    Boolean,
      default: false
    },

    provider: {
      type:     String,
      required: true,
    }
  },

  async fetch() {
    this.errors = [];
    if ( !this.credentialId ) {
      return;
    }

    if (this.mode === _VIEW) {
      this.initForViewMode();

      return;
    }

    try {
      this.credential = await this.$store.dispatch('rancher/find', { type: NORMAN.CLOUD_CREDENTIAL, id: this.credentialId });
    } catch (e) {
      this.credential = null;
    }

    // Try and get the secret for the Cloud Credential as we need the plain-text password
    try {
      const id = this.credentialId.replace(':', '/');
      const secret = await this.$store.dispatch('management/find', { type: SECRET, id });
      const dataPassword = secret.data['vcdcredentialConfig-password'];
      const password = atob(dataPassword);

      this.password = password;
      this.havePassword = true;
      this.ready = true;
    } catch (e) {
      // this.credential = null;
      this.password = '';
      this.havePassword = false;
      console.error(e); // eslint-disable-line no-console
    }

    this.$set(this, 'authenticating', true);

    const vcd = new Vcd(this.$store, this.credential);

    vcd.password = this.password;

    this.vcd = vcd;

    // Fetch a token - if this succeeds, kick off async fetching the lists we need
    this.vcd.getToken().then((res) => {
      if (res.error) {
        this.$set(this, 'authenticating', false);
        this.$emit('validationChanged', false);

        this.errors.push('Unable to authenticate with the vCloud Director server');

        return;
      }

      this.$set(this, 'authenticating', false);
      const ipaddressallocationmode = [{ name: 'NONE' }, { name: 'DHCP' }, { name: 'POOL' }, { name: 'MANUAL' }];

      vcd.setOptions(ipaddressallocationmode, this.ipaddressallocationmode, '', undefined, this.value?.ipaddressallocationmode);
      vcd.getCatalog(this.catalogs, this.value?.catalog);
      vcd.getNetwork(this.orgvdcnetwork, this.value?.orgvdcnetwork);
      vcd.getStorage(this.storprofile, this.value?.storprofile);
    });

    this.$emit('validationChanged', true);
  },

  data() {
    return {
      authenticating:          false,
      ready:                   false,
      vcd:                     null,
      password:                null,
      havePassword:            false,
      operatingSystem:         initOptions(),
      networkadaptertype:      initOptions(),
      catalogs:                initOptions(),
      catalogitem:             initOptions(),
      orgvdcnetwork:           initOptions(),
      storprofile:             initOptions(),
      vAppVms:                 initOptions(),
      ipaddressallocationmode: initOptions(),
      memorySize:              this.value?.memorySize || 4096,
      diskSize:                this.value?.diskSize || 20480,
      cpuCount:                this.value?.cpuCount || 2,
      sshUser:                 this.value?.sshUser || 'docker',
      initData:                this.value?.initData || null,
      userData:                this.value?.userData || null,
      edgegateway:             this.value?.edgegateway || null,
      vdcedgegateway:          this.value?.vdcedgegateway || null,
      publicip:                this.value?.publicip || null,
      rke2:                    this.value?.rke2 || true,
      insecure:                this.value?.insecure || false,
      errors:                  null,
    };
  },

  watch: {
    'credentialId'() {
      this.$fetch();
    },
    'catalogs.selected': {
      handler(val, oldVal) {
        if (val.name === undefined) {
          return;
        }
        this.vcd.getTemplate(this.catalogitem, val.name, this.value?.catalogitem);
      }
    },
    'catalogitem.selected': {
      handler(val, oldVal) {
        if (val.name === undefined) {
          return;
        }
        this.vcd.getVAppVms(this.vAppVms, val.href);
      }
    },
    'vAppVms.selected': {
      handler(val, oldVal) {
        if (val.osType === undefined) {
          return;
        }
        this.vcd.getOperatingSystem(this.operatingSystem, val.hardwareVersionHref, val.osType);
      }
    },
    'operatingSystem.selected': {
      handler(val, oldVal) {
        if (val.name === undefined) {
          return;
        }
        this.vcd.setOptions(val, this.networkadaptertype, 'supportedNICType', undefined, this.value?.networkadaptertype);
      }
    }
  },

  methods: {
    stringify,

    initForViewMode() {
      this.fakeSelectOptions(this.catalogs, this.value?.catalog);
      this.fakeSelectOptions(this.catalogitem, this.value?.catalogitem);
      this.fakeSelectOptions(this.orgvdcnetwork, this.value?.orgvdcnetwork);
      this.fakeSelectOptions(this.storprofile, this.value?.storprofile);
      this.fakeSelectOptions(this.networkadaptertype, this.value?.networkadaptertype);
      this.fakeSelectOptions(this.ipaddressallocationmode, this.value?.ipaddressallocationmode);
    },

    fakeSelectOptions(list, value) {
      list.busy = false;
      list.enabled = false;
      list.options = [];

      if (value) {
        list.options.push({
          label: value,
          value,
        });
      }

      list.selected = value;
    },

    syncValue() {
      // Note: We don't need to provide password as this is picked up via the credential

      // Copy the values from the form to the correct places on the value
      this.value.catalog = this.catalogs.selected?.name;
      this.value.catalogitem = this.catalogitem.selected?.name;
      this.value.orgvdcnetwork = this.orgvdcnetwork.selected?.name;
      this.value.storprofile = this.storprofile.selected?.name;
      this.value.networkadaptertype = this.networkadaptertype.selected?.name;

      this.value.ipaddressallocationmode = this.ipaddressallocationmode.selected?.name;
      this.value.cpuCount = this.cpuCount;
      this.value.memorySize = this.memorySize;
      this.value.diskSize = this.diskSize;
      this.value.sshUser = this.sshUser;
      this.value.initData = this.initData;
      this.value.userData = this.userData;
      this.value.edgegateway = this.edgegateway;
      this.value.vdcedgegateway = this.vdcedgegateway;
      this.value.publicip = this.publicip;
      this.value.insecure = this.insecure;

      // Not configurable
      this.value.sshPort = '22';
      this.value.rke2 = true;
    },

    test() {
      this.syncValue();
    }
  }
};
</script>

<template>
  <div>
    <Loading
      v-if="$fetchState.pending"
      :delayed="true"
    />
    <div v-if="errors.length">
      <div
        v-for="(err, idx) in errors"
        :key="idx"
      >
        <Banner
          color="error"
          :label="stringify(err)"
        />
      </div>
    </div>
    <div>
      <div class="vcd-config">
        <div class="title">
          vCloud Director Configuration
        </div>
        <div
          v-if="authenticating"
          class="loading"
        >
          <i class="icon-spinner icon-spin icon-lg" />
          <span>
            Authenticating with the vCloud Director server ...
          </span>
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledSelect
            v-model="catalogs.selected"
            label="Catalog"
            :options="catalogs.options"
            :disabled="!catalogs.enabled || busy"
            :loading="catalogs.busy"
            :searchable="false"
          />
        </div>
        <div class="col span-6">
          <LabeledSelect
            v-model="catalogitem.selected"
            label="vApp template"
            :options="catalogitem.options"
            :disabled="!catalogs.enabled && !catalogitem.enabled"
            :loading="catalogitem.busy || catalogs.busy"
            :searchable="false"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledSelect
            v-model="orgvdcnetwork.selected"
            label="Network"
            :options="orgvdcnetwork.options"
            :disabled="!orgvdcnetwork.enabled || busy"
            :loading="orgvdcnetwork.busy"
            :searchable="false"
          />
        </div>
        <div class="col span-6">
          <LabeledSelect
            v-model="networkadaptertype.selected"
            label="Network Adapter"
            :options="networkadaptertype.options"
            :disabled="!catalogitem.enabled && !networkadaptertype.enabled && !vAppVms.enabled && !operatingSystem.enabled"
            :loading="networkadaptertype.busy || catalogitem.busy || vAppVms.busy || operatingSystem.busy"
            :searchable="false"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledSelect
            v-model="ipaddressallocationmode.selected"
            label="IP Address Allocation Mode"
            :options="ipaddressallocationmode.options"
            :disabled="busy"
            :searchable="false"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledSelect
            v-model="storprofile.selected"
            label="Storage"
            :options="storprofile.options"
            :disabled="!storprofile.enabled || busy"
            :loading="storprofile.busy"
            :searchable="false"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <UnitInput
            v-model="cpuCount"
            :mode="mode"
            :disabled="busy"
            :required="true"
            label="CPU"
            suffix="Cores"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <UnitInput
            v-model="memorySize"
            :mode="mode"
            :disabled="busy"
            :required="true"
            label="Memory"
            suffix="MB"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <UnitInput
            v-model="diskSize"
            :mode="mode"
            :disabled="busy"
            :required="true"
            label="Disk size"
            suffix="MB"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledInput
            v-model="sshUser"
            :mode="mode"
            :disabled="busy"
            :required="true"
            label="SSH User"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledInput
            v-model="initData"
            :mode="mode"
            :disabled="busy"
            label="Cloud-init based User data before everything"
          />
        </div>
        <div class="col span-6">
          <LabeledInput
            v-model="userData"
            :mode="mode"
            :disabled="busy"
            label="Cloud-init based User data"
          />
        </div>
      </div>
      <br/>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledInput
            v-model="edgegateway"
            :mode="mode"
            :disabled="busy"
            label="Edge Gateway (Default is <vdc>)"
          />
        </div>
        <div class="col span-6">
          <LabeledInput
            v-model="vdcedgegateway"
            :mode="mode"
            :disabled="busy"
            label="Virtual Data Center Edge Gateway"
          />
        </div>
      </div>
      <div class="row mt-10">
        <div class="col span-6">
          <LabeledInput
            v-model="publicip"
            :mode="mode"
            :disabled="busy"
            label="Public IP to use"
          />
        </div>
        <div class="col span-6">
          <Checkbox
            v-model="insecure"
            :mode="mode"
            :disabled="busy"
            label="Insecure api"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
  .file-button {
    align-items: center;
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    display: flex;

    > .file-selector {
      height: calc($input-height - 2px);
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }

  .vcd-config {
    display: flex;
    align-items: center;

    > .title {
      font-weight: bold;
      padding: 4px 0;
    }

    > .loading {
      margin-left: 20px;
      display: flex;
      align-items: center;

      > i {
        margin-right: 4px;;
      }
    }
  }
</style>
