import { getBackendSrv } from '@grafana/runtime';

export default class StravaApi {
  datasourceId: number;
  backendAPIUrl: string;
  backendAuthUrl: string;
  apiUrl: string;
  promises: any;

  constructor(datasourceId: number) {
    this.datasourceId = datasourceId;
    this.backendAPIUrl = `/api/datasources/${this.datasourceId}/resources/strava-api`;
    this.backendAuthUrl = `/api/datasources/${this.datasourceId}/resources/auth`;

    // this.apiUrl = url;
    this.promises = {};
    this.apiUrl = '';
  }

  async getAuthenticatedAthlete(params?: any) {
    return await this.tsdbRequest('athlete', params);
  }

  async getActivities(params?: any) {
    return await this.requestWithPagination('athlete/activities', params);
  }

  async requestWithPagination(url: string, params?: any) {
    let data: any[] = [];
    let chunk = [];
    let page = 1;
    const limit = params && params.limit;
    const per_page = (params && params.per_page) || 200;
    while (!(chunk.length === 0 && page !== 1) && !(limit && data.length >= limit)) {
      params = {
        ...params,
        per_page,
        page,
      };
      try {
        // chunk = await this.request(url, params);
        chunk = await this.tsdbRequest(url, params);
      } catch (error) {
        throw error;
      }
      data = data.concat(chunk);
      page++;
    }
    return data;
  }

  async exchangeToken(authCode: any) {
    return await this.tsdbAuthRequest({ authCode });
  }

  async request(url: string, params?: any) {
    return this.proxyfy(this._request, '_request', this)(url, params);
  }

  async _request(url: string, params?: any) {
    try {
      const response = await getBackendSrv().datasourceRequest({
        url: `${this.apiUrl}/strava/${url}`,
        method: 'GET',
        params,
      });
      return response.data;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async tsdbRequest(endpoint: string, params?: any) {
    return this.proxyfy(this._tsdbRequest, '_tsdbRequest', this)(endpoint, params);
  }

  async _tsdbRequest(endpoint: string, params?: any) {
    try {
      const response = await getBackendSrv().datasourceRequest({
        url: this.backendAPIUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          datasourceId: this.datasourceId,
          endpoint,
          params,
        },
      });
      return this.handleTsdbResponse(response);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async tsdbAuthRequest(params?: any) {
    const queryType = 'stravaAuth';

    try {
      const response = await getBackendSrv().datasourceRequest({
        url: this.backendAuthUrl,
        method: 'POST',
        data: params,
      });
      return this.handleTsdbResponse(response, queryType);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  handleTsdbResponse(response: any, queryType = 'stravaAPI') {
    console.log(response);
    if (response && (response.status >= 400 || response.status < 0)) {
      throw Error(response.statusText);
    }

    if (!response || !response.data || !response.data.result) {
      return [];
    }

    const responseData = response.data.result;
    if (responseData.error) {
      throw Error(responseData.error);
    }

    return responseData;
  }

  proxyfy(func: any, funcName: any, funcScope: any) {
    if (!this.promises[funcName]) {
      this.promises[funcName] = {};
    }
    const promiseKeeper = this.promises[funcName];
    return callOnce(func, promiseKeeper, funcScope);
  }
}

/**
 * Wrap request to prevent multiple calls
 * with same params when waiting for result.
 */
function callOnce(func: any, promiseKeeper: any, funcScope: any): (...args: any[]) => any {
  return function() {
    var hash = getRequestHash(arguments);
    if (!promiseKeeper[hash]) {
      promiseKeeper[hash] = Promise.resolve(
        func.apply(funcScope, arguments).then((result: any) => {
          promiseKeeper[hash] = null;
          return result;
        })
      );
    }
    return promiseKeeper[hash];
  };
}

function getRequestHash(args: any) {
  const argsJson = JSON.stringify(args);
  return getHash(argsJson);
}

function getHash(srt: string) {
  var hash = 0,
    i,
    chr,
    len;
  if (srt.length !== 0) {
    for (i = 0, len = srt.length; i < len; i++) {
      chr = srt.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
  }
  return hash;
}
