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
    // TODO: Validate that we can get a token for the project that the user has selected
    test() {
      // In the cluster creation flow, annotations is not set, so ensure it is set first
      this.value.annotations = this.value.annotations || {};

      this.value.annotations['vcd.cattle.io/username'] = this.value.decodedData.username;
      this.value.annotations['vcd.cattle.io/org'] = this.value.decodedData.org;
      this.value.annotations['vcd.cattle.io/href'] = this.value.decodedData.href;

      if (this.vdc) {
        this.value.annotations['vcd.cattle.io/vdc'] = this.vdc;
      }

      return true;
    },

    // When the user clicked 'Edit Auth Config', clear the projects and set the step back to 1
    // so the user can modify the credentials needed to fetch the projects
    clear() {
      this.$set(this, 'step', 1);
      this.$set(this, 'vdcs', null);
      this.$set(this, 'errorAllowHost', false);

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
      this.$set(this, 'allowBusy', true);
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
        this.$set(this, 'allowBusy', false);
      }
    },

    async connect(cb) {
      this.$set(this, 'error', '');
      this.$set(this, 'errorAllowHost', false);

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

      this.$set(this, 'allowBusy', false);
      this.$set(this, 'step', 2);
      this.$set(this, 'busy', true);

      const res = await vcd.getToken();

      if (res.error) {
        console.error(res.error); // eslint-disable-line no-console
        okay = false;

        this.$set(this, 'step', 1);
        this.$set(this, 'vdcs', null);

        if (res.error._status === 502 && !this.hostInAllowList()) {
          this.$set(this, 'errorAllowHost', true);
        } else {
          if (res.error._status === 502) {
            // Still got 502, even with URL in the allow list
            this.$set(this, 'error', this.t('driver.vcd.auth.errors.badGateway'));
          } else if (res.error._status === 401) {
            this.$set(this, 'error', this.t('driver.vcd.auth.errors.unauthorized'));
          } else {
            // Generic error
            this.$set(this, 'error', res.error.message || this.t('driver.vcd.auth.errors.other'));
          }
        }
      } else {
        const vdcs = await vcd.getVdcs();
        // console.log(vdcs);
        // this.$set(this, 'vdcs', vdcs);
        // okay = true;
        if (!vdcs.error) {
          this.$set(this, 'vdcs', vdcs);
          okay = true;
        } else {
          this.$set(this, 'error', vdcs.error.message);
        }
      }
      this.$set(this, 'busy', false);
      this.$set(this, 'vdc', this.vdcOptions[0]?.value);
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
          @input="value.setData('href', $event);"
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
          @input="value.setData('org', $event);"
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
          @input="value.setData('username', $event);"
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
          @input="value.setData('password', $event);"
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
          v-model="vdc"
          label-key="driver.vcd.auth.fields.vdc"
          :options="vdcOptions"
          :searchable="false"
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