import * as utils from 'src/utils'
import { Renderer } from 'src/Renderer'
import { registerBidder } from 'src/adapters/bidderFactory'

function configureUniversalTag (exchangeRenderer) {
  parent.window.unruly = parent.window.unruly || {};
  parent.window.unruly['native'] = parent.window.unruly['native'] || {};
  parent.window.unruly['native'].siteId = parent.window.unruly['native'].siteId || exchangeRenderer.siteId
}

function configureRendererQueue () {
  parent.window.unruly['native'].prebid = parent.window.unruly['native'].prebid || {};
  parent.window.unruly['native'].prebid.uq = parent.window.unruly['native'].prebid.uq || []
}

function notifyRenderer (bidResponseBid) {
  parent.window.unruly['native'].prebid.uq.push(['render', bidResponseBid])
}

const serverResponseToBid = bid => ({
  requestId: bid.bidId,
  cpm: bid.cpm,
  width: bid.width,
  height: bid.height,
  vastUrl: bid.vastUrl,
  netRevenue: true
});

const buildPrebidResponseAndInstallRenderer = bids =>
  bids
    .filter(serverBid => !!utils.deepAccess(serverBid, 'ext.renderer'))
    .map(serverBid => {
      const exchangeRenderer = utils.deepAccess(serverBid, 'ext.renderer');
      configureUniversalTag(exchangeRenderer);
      configureRendererQueue();

      const rendererInstance = Renderer.install(Object.assign({}, exchangeRenderer, { callback: () => {} }));
      return { rendererInstance, serverBid }
    })
    .map(
      ({rendererInstance, serverBid}) => {
        const prebidBid = serverResponseToBid(serverBid);

        const rendererConfig = Object.assign(
          {},
          prebidBid,
          {
            renderer: rendererInstance,
            adUnitCode: serverBid.ext.placementCode
          }
        );

        rendererInstance.setRender(() => { notifyRenderer(rendererConfig) });

        return prebidBid
      }
    );

export const adapter = {
  code: 'unruly',

  isBidRequestValid: function(bid) {
    if (!bid) return false;

    const videoMediaType = (bid.mediaTypes && bid.mediaTypes.video)
      ? bid.mediaTypes.video
      : null;

    const context = (videoMediaType && videoMediaType.context)
      ? videoMediaType.context
      : null;

    return bid.mediaType === 'video' || context === 'outstream';
  },

  buildRequests: function(validBidRequests) {
    const url = 'https://targeting.unrulymedia.com/prebid';
    const method = 'POST';
    const data = { bidRequests: validBidRequests };

    return {
      url,
      method,
      data,
    };
  },

  interpretResponse: function(serverResponse) {
    const noBidsResponse = [];
    const isInvalidResponse = !serverResponse || !serverResponse.bids;

    return isInvalidResponse
      ? noBidsResponse
      : buildPrebidResponseAndInstallRenderer(serverResponse.bids);
  }
};

registerBidder(adapter);
