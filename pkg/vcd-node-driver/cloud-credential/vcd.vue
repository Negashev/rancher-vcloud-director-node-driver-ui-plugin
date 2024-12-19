<script>
import Banner from '@components/Banner/Banner.vue';
import { LabeledInput } from '@components/Form/LabeledInput';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { parse as parseUrl } from '@shell/utils/url';
import { _CREATE } from '@shell/config/query-params';
import BusyButton from '../components/BusyButton.vue';
import { Vcd } from '../vcd.ts';

export default {
  components: {
    Banner,
    BusyButton,
    LabeledInput,
    LabeledSelect,
  },

  props: {
    mode: {
      type:     String,
      required: true,
    },

    value: {
      type:     Object,
      required: true,
    },
  },

  async fetch() {
    this.driver = await this.$store.dispatch('rancher/find', {
      type: 'nodedriver',
      id:   'vcd'
    });
  },

  data() {
    if (this.mode !== _CREATE) {
      this.value.decodedData.username = this.value.annotations['vcd.cattle.io/username'];
      this.value.decodedData.org = this.value.annotations['vcd.cattle.io/org'];
      this.value.decodedData.href = this.value.annotations['vcd.cattle.io/href'];
    }

    return {
      vdcs:           null,
      vdc:            '',
      vappNames:      null,
      vappName:       '',
      step:           1,
      busy:           false,
      errorAllowHost: false,
      driver:         {},
      allowBusy:      false,
      error:          '',
    };
  },

  computed: {
    vdcOptions() {
      const sorted = (this.vdcs || []).sort((a, b) => a.name.localeCompare(b.name));

      return sorted.map((p) => {
        return {
          label: p.name,
          value: p.name
        };
      });
    },
    vappNamesOptions() {
      const sorted = (this.vappNames || []).sort((a, b) => a.name.localeCompare(b.name));
      return sorted.map((p) => {
        return {
          label: p.name,
          value: p.name
        };
      });
    },

    hostname() {
      const u = parseUrl(this.value.decodedData.href);

      return u?.host || '';
    },

    canAuthenticate() {
      return !!this.value?.decodedData?.href &&
        !!this.value?.decodedData?.org &&
        !!this.value?.decodedData?.username &&
        !!this.value?.decodedData?.password;
    }
  },

  created() {
    this.$emit('validationChanged', false);
  },

  methods: {
    // TODO: Validate that we can get a token for the vdc that the user has selected
    test() {
      // In the cluster creation flow, annotations is not set, so ensure it is set first
      this.value.annotations = this.value.annotations || {};

      this.value.annotations['vcd.cattle.io/username'] = this.value.decodedData.username;
      this.value.annotations['vcd.cattle.io/org'] = this.value.decodedData.org;
      this.value.annotations['vcd.cattle.io/href'] = this.value.decodedData.href;

      if (this.vdc !== '') {
        this.value.annotations['vcd.cattle.io/vdc'] = this.vdc;
      }

      if (this.vappName !== '') {
        this.value.annotations['vcd.cattle.io/vappName'] = this.vappName;
      }

      return true;
    },

    // When the user clicked 'Edit Auth Config', clear the projects and set the step back to 1
    // so the user can modify the credentials needed to fetch the projects
    clear() {
      this['step'] = 1;
      this['vdcs'] = null;
      this['vappNames'] = null;
      this['errorAllowHost'] = false;

      // Tell parent that the form is not invalid
      this.$emit('validationChanged', false);
    },

    hostInAllowList() {
      if (!this.driver?.whitelistDomains) {
        return false;
      }

      const u = parseUrl(this.value.decodedData.href);

      if (!u.host) {
        return true;
      }

      return (this.driver?.whitelistDomains || []).includes(u.host);
    },

    async addHostToAllowList() {
      this['allowBusy'] = true;
      const u = parseUrl(this.value.decodedData.href);

      this.driver.whitelistDomains = this.driver.whitelistDomains || [];

      if (!this.hostInAllowList()) {
        this.driver.whitelistDomains.push(u.host);
      }

      try {
        await this.driver.save();

        this.$refs.connect.$el.click();
      } catch (e) {
        console.error('Could not update driver', e); // eslint-disable-line no-console
        this['allowBusy'] = false;
      }
    },

    async connect(cb) {
      this['error'] = '';
      this['errorAllowHost'] = false;

      let okay = false;

      if (!this.value.decodedData.href) {
        return cb(okay);
      }

      const vcd = new Vcd(this.$store, {
        href:       this.value.decodedData.href,
        org:        this.value.decodedData.org,
        username:   this.value.decodedData.username,
        password:   this.value.decodedData.password,
      });

      this['allowBusy'] = false;
      this['step'] = 2;
      this['busy'] = true;

      const res = await vcd.getToken();

      if (res.error) {
        console.error(res.error); // eslint-disable-line no-console
        okay = false;

        this['step'] = 1;
        this['vdcs'] = null;

        if (res.error._status === 502 && !this.hostInAllowList()) {
          this['errorAllowHost'] = true;
        } else {
          if (res.error._status === 502) {
            // Still got 502, even with URL in the allow list
            this['error'] = this.t('driver.vcd.auth.errors.badGateway');
          } else if (res.error._status === 401) {
            this['error'] = this.t('driver.vcd.auth.errors.unauthorized');
          } else {
            // Generic error
            this['error'] = res.error.message || this.t('driver.vcd.auth.errors.other');
          }
        }
      } else {
        const vdcs = await vcd.getVdcs();

        if (!vdcs.error) {
          this['vdcs'] = vdcs;
          okay = true;
        } else {
          this['error'] = vdcs.error.message;
          okay = false;
        }
        const vappNames = await vcd.getVApps();
        if (!vappNames.error) {
          this['vappNames'] = vappNames;
          okay = true;
        } else {
          this['error'] = vappNames.error.message;
          okay = false;
        }
      }
      this['busy'] = false;
      this['vdc'] = this.vdcOptions[0]?.value;
      this['vappName'] = this.vappNamesOptions[0]?.value;
      this.$emit('validationChanged', okay);

      cb(okay);
    }
  }
};
</script>

<template>
  <div>
    <div class="row">
      <div class="col span-6">
        <LabeledInput
          :value="value.decodedData.href"
          :disabled="step !== 1"
          label-key="driver.vcd.auth.fields.href"
          placeholder-key="driver.vcd.auth.placeholders.href"
          type="text"
          :mode="mode"
          @update:value="value.setData('href', $event);"
        />
      </div>
      <div class="col span-6">
        <LabeledInput
          :value="value.decodedData.org"
          :disabled="step !== 1"
          label-key="driver.vcd.auth.fields.org"
          placeholder-key="driver.vcd.auth.placeholders.org"
          type="text"
          :mode="mode"
          @update:value="value.setData('org', $event);"
        />
      </div>
    </div>
    <div class="row">
      <div class="col span-6">
        <LabeledInput
          :value="value.decodedData.username"
          :disabled="step !== 1"
          class="mt-20"
          label-key="driver.vcd.auth.fields.username"
          placeholder-key="driver.vcd.auth.placeholders.username"
          type="text"
          :mode="mode"
          @update:value="value.setData('username', $event);"
        />
      </div>
      <div class="col span-6">
        <LabeledInput
          :value="value.decodedData.password"
          :disabled="step !== 1"
          class="mt-20"
          label-key="driver.vcd.auth.fields.password"
          placeholder-key="driver.vcd.auth.placeholders.password"
          type="password"
          :mode="mode"
          @update:value="value.setData('password', $event);"
        />
      </div>
    </div>

    <BusyButton
      ref="connect"
      label-key="driver.vcd.auth.actions.authenticate"
      :disabled="step !== 1 || !canAuthenticate"
      class="mt-20"
      @click="connect"
    />

    <button
      class="btn role-primary mt-20 ml-20"
      :disabled="busy || step === 1"
      @click="clear"
    >
      {{ t('driver.vcd.auth.actions.edit') }}
    </button>

    <Banner
      v-if="error"
      class="mt-20"
      color="error"
    >
      {{ error }}
    </Banner>

    <Banner
      v-if="errorAllowHost"
      color="error"
      class="allow-list-error"
    >
      <div>
        {{ t('driver.vcd.auth.errors.notAllowed', { hostname }) }}
      </div>
      <button
        :disabled="allowBusy"
        class="btn ml-10 role-primary"
        @click="addHostToAllowList"
      >
        {{ t('driver.vcd.auth.actions.addToAllowList') }}
      </button>
    </Banner>
    <div
      v-if="vdcs"
      class="row mt-20"
    >
      <div class="col span-6">
        <LabeledSelect
          v-model:value="vdc"
          label-key="driver.vcd.auth.fields.vdc"
          :options="vdcOptions"
          :searchable="false"
          @update:value="value.setData('vdc', $event);"
        />
      </div>
      <div class="col span-6">
        <LabeledSelect
          v-model:value="vappName"
          label-key="driver.vcd.auth.fields.vapp"
          :options="vappNamesOptions"
          :searchable="false"
          @update:value="value.setData('vappName', $event);"
        />
      </div>
    </div>
  </div>
</template>
<style lang="scss" scoped>
  .allow-list-error {
    display: flex;

    > :first-child {
      flex: 1;
    }
  }
</style>