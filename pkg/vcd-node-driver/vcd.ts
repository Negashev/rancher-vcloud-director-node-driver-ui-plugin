/**
 * Helper class for dealing with the vCloud Director API
 */

import { parse as parseUrl } from '@shell/utils/url';

export class Vcd {
    public href: string = '';
    public username: string = '';
    public password: string = '';
    public org: string = '';
    public orgId: string = '';
    public version: string = '36.0';
    public vdc: string = '';
    public token: string = '';

    private $dispatch: any;

    constructor($store: any, obj: any) {
      if (obj.annotations) {
        Object.keys(obj.annotations).forEach((key) => {
          const p = key.split('/');

          if (p.length === 2 && p[0] === 'vcd.cattle.io') {
            const field = p[1];

            (this as any)[field] = obj.annotations[key];
          }
        });
      } else {
        // Copy from options to this
        Object.keys(obj).forEach((key) => {
          (this as any)[key] = obj[key];
        });
      }

      this.$dispatch = $store.dispatch;
    }

    public protocolHostname(href: string) {
      const u = parseUrl(href);
      return u?.host || '';
    }

    public async getToken() {
      const url = `/meta/proxy/${ this.protocolHostname(this.href) }/cloudapi/1.0.0/sessions`;

      const headers = { 
        Accept: 'application/*;version=' + this.version,
        'X-API-Auth-Header': 'Basic ' + btoa(this.username + '@' + this.org + ':' + this.password)
      };

      try {
        const res = await this.$dispatch('management/request', {
          url,
          headers,
          method:               'POST',
          redirectUnauthorized: false
        }, { root: true });

        if (res._status === 502) {
          return { error: 'Could not proxy request - URL may not be in Rancher\'s allow list' };
        }

        const token = res._headers['x-vmware-vcloud-access-token'];

        this.token = token;

        this.orgId = res.org.id.replace(/^urn:vcloud:org:/, '');

        return res;
      } catch (e) {
        console.error(e); // eslint-disable-line no-console

        return { error: e };
      }
    }

    public async getFlavors(value: any, initial?: string) {
      return await this.getOptions(value, '/flavors', 'flavors', undefined, initial);
    }

    public async getAvailabilityZones(value: any, initial?: string) {
      return await this.getOptions(value, '/os-availability-zone', 'availabilityZoneInfo', (zone: any) => {
        return {
          ...zone,
          name: zone.zoneName
        };
      }, initial);
    }

    public async getOptions(value: any, api: string, field: string, mapper?: Function, initial?: string) {
      // We are fetching the data for the options
      value.busy = true;
      value.enabled = true;
      value.selected = '';

      const res = await this.makeComputeRequest(api);

      if (res && (res as any)[field]) {
        let list = (res as any)[field] || [];

        if (mapper) {
          list = list.map((k: any) => mapper(k));
        }

        value.options = this.convertToOptions(list);
        value.busy = false;

        if (initial) {
          const found = value.options.find((option: any) => option.value.name === initial);

          if (found) {
            value.selected = found.value;
          }
        }

        if (!value.selected && value.options.length > 0) {
          value.selected = value.options[0].value;
        }
      } else {
        value.options = [];
        value.selected = null;
        value.busy = false;
        value.enabled = false;
      }
    }

    public async makeComputeRequest(api: string) {
      const href = this.href.replace(/^https?:\/\//, '');
      const baseUrl = `/meta/proxy/${ href }`;
      const url = `${ baseUrl }${ api }`;

      const headers = {
        Accept:        'application/*+json;version=' + this.version,
        'X-API-Auth-Header': 'Bearer ' + this.token
      };

      try {
        const res = await this.$dispatch('management/request', {
          url,
          headers,
          method:               'GET',
          redirectUnauthorized: false,
        }, { root: true });

        return res;
      } catch (e) {
        console.error(e); // eslint-disable-line no-console
      }
    }

    public async getVdcs() {
      const href = this.href.replace(/^https?:\/\//, '');
      const baseUrl = `/meta/proxy/${ href }`;

      const headers = {
        Accept:        'application/*+json;version=' + this.version,
        'X-API-Auth-Header': 'Bearer ' + this.token
      };

      try {
        const res = await this.$dispatch('management/request', {
          url:                  `${ baseUrl }/org/${ this.orgId }/vdcRollup`,
          headers,
          method:               'GET',
          redirectUnauthorized: false,
        }, { root: true });
        
        return res?.orgVdcReference;
      } catch (e) {
        console.error(e); // eslint-disable-line no-console

        return { error: e };
      }
    }

    public async getRegions() {
      const href = this.href.replace(/^https?:\/\//, '');
      const baseUrl = `/meta/proxy/${ href }`;

      const headers = {
        Accept:        'application/*;version=' + this.version,
        'X-API-Auth-Header': 'Bearer ' + this.token
      };

      try {
        const res = await this.$dispatch('management/request', {
          url:                  `${ baseUrl }/regions`,
          headers,
          method:               'GET',
          redirectUnauthorized: false,
        }, { root: true });

        return res?.regions;
      } catch (e) {
        console.error(e); // eslint-disable-line no-console

        return { error: e };
      }
    }

    private convertToOptions(list: any) {
      const sorted = (list || []).sort((a: any, b: any) => a.name.localeCompare(b.name));

      return sorted.map((p: any) => {
        return {
          label: p.name,
          value: p
        };
      });
    }
}