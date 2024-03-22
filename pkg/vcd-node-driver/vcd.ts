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

    public getDeepKey(from: any, selectors: string) {
      return selectors.replace(/\[([^\[\]]*)\]/g, '.$1.')
        .split('.')
        .filter(t => t !== '')
        .reduce((prev, cur) => prev && prev[cur], from)
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

    public async getCatalog(value: any, initial?: string) {
      return await this.getOptions(value, '/query?type=catalog&pageSize=1000', 'record', undefined, initial);
    }

    public async getTemplate(value: any, catalog: string, initial?: string) {
      return await this.getOptions(value, `/query?type=vAppTemplate&pageSize=1000&filter=(catalogName==${ catalog })`, 'record', undefined, initial);
    }

    public async getNetwork(value: any, initial?: string) {
      return await this.getOptions(value, `/cloudapi/1.0.0/orgVdcNetworks?filterEncoded=true&pageSize=20&filter=((crossVdcNetworkId==null))`, 'values', undefined, initial, true);
    }

    public async getStorage(value: any, initial?: string) {
      return await this.getOptions(value, '/query?type=orgVdcStorageProfile&pageSize=1000', 'record', undefined, initial);
    }

    public async getVAppVms(value: any, api: string, initial?: string) {
      return await this.getOptions(value, parseUrl(api).path.replace(/^\/api/, ''), 'children.vm', (vm: any) => {
        const vmx = vm.section.find((section: any)=> section._type === 'VmSpecSectionType');

        return {
          ...vm,
          osType:              vmx.osType,
          hardwareVersionHref: vmx.hardwareVersion.href
        };
      }, initial);
    }

    public async getOperatingSystem(value: any, api: string, initial?: string) {
      return await this.getOptions(value, parseUrl(api).path.replace(/^\/api/, ''), 'supportedOperatingSystems.operatingSystemFamilyInfo[1].operatingSystem', (os: any) => {
        return {
          ...os,
          name: os.internalName
        };
      }, initial);
    }

    public setOptions(res: any, value: any, field: string, mapper?: Function, initial?: string) {
      if (res) {
        let list = this.getDeepKey(res, field) || [];

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

    public async getOptions(value: any, api: string, field: string, mapper?: Function, initial?: string, domain?: boolean) {
      // We are fetching the data for the options
      value.busy = true;
      value.enabled = true;
      value.selected = '';

      let loopPages = true;

      let res = await this.makeComputeRequest(api, domain);
      let totalResults = res;
      let page = 1;

      if (res?.pageCount) {
        while (loopPages) {
          if (res?.pageCount > res?.page) {
            page = res.page + 1;
            res = await this.makeComputeRequest(api + '&page=' + page, domain);
            totalResults[field] = totalResults[field].concat(res[field]);
          } else {
            loopPages = false;
          }
        }
      }

      this.setOptions(totalResults, value, field, mapper, initial);
    }

    public async makeComputeRequest(api: string, domain?: boolean) {
      const href = domain ? parseUrl(this.href).host : this.href.replace(/^https?:\/\//, '');

      const baseUrl = `/meta/proxy/${ href }`;
      const url = `${ baseUrl }${ api }`;

      const headers = domain ? {
        Accept:        'application/json;multisite=global;version=' + this.version,
        'X-API-Auth-Header': 'Bearer ' + this.token
      } : {
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