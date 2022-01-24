const networks = require('./networks');

const getNetworks = async (l1Signer, l2Signer) => {
  // check network chainId
  const [l1ChainId, l2ChainId] = await Promise.all([
    l1Signer.getChainId(),
    l2Signer.getChainId(),
  ]);

  const l1Network = networks[l1ChainId];
  const l2Network = networks[l2ChainId];

  if (!l1Network || !l1Network.name) throw Error('Invalid L1 chainId');
  if (!l2Network || !l2Network.name) throw Error('Invalid L2 chainId');

  return { l1Network, l2Network };
};

module.exports = getNetworks;
