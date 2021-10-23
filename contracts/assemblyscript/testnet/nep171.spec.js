const nearAPI = require("near-api-js");
const os = require('os');
const fs = require('fs');
const BN = require('bn.js');
const assert = require("assert");

const keyStore1 = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(
  `${os.homedir()}/.near-credentials/`
);
const keyStore2 = new nearAPI.keyStores.InMemoryKeyStore();
const keyStore = new nearAPI.keyStores.MergeKeyStore([keyStore1, keyStore2]);
const contractName = fs.readFileSync('neardev/dev-account').toString();

describe('NEP-171', () => {
  it('should mint, view and transfer token using NEP-171', async () => {
    const account1kp = nearAPI.utils.KeyPairEd25519.fromRandom();
    const account2kp = nearAPI.utils.KeyPairEd25519.fromRandom();
    const signer1AccountId = Buffer.from(account1kp.publicKey.data).toString('hex');
    const signer2AccountId = Buffer.from(account2kp.publicKey.data).toString('hex');

    keyStore2.setKey('testnet', signer1AccountId, account1kp);
    keyStore2.setKey('testnet', signer2AccountId, account2kp);

    console.log(contractName, signer1AccountId, signer2AccountId);

    // Initializing connection to the NEAR node.
    const near = await nearAPI.connect({
      deps: {
        keyStore
      },
      nodeUrl: "https://rpc.testnet.near.org",
      networkId: "testnet"
    });

    const devAccount = await near.account(contractName);
    await devAccount.sendMoney(signer1AccountId, new BN('100000000000000000000000', 10));
    await devAccount.sendMoney(signer2AccountId, new BN('200000000000000000000000', 10));

    const account1 = await near.account(signer1AccountId);
    await account1.addKey(nearAPI.utils.KeyPairEd25519.fromRandom().publicKey, contractName);

    const account2 = await near.account(signer2AccountId);
    await account2.addKey(nearAPI.utils.KeyPairEd25519.fromRandom().publicKey, contractName);

    const contentbase64 = Buffer.from('test').toString('base64');
    let result = await account1.functionCall(contractName, 'mint_to_base64', {
      owner_id: signer1AccountId, supportmixing: true,
      contentbase64: contentbase64
    }, null, '800000000000000000000');

    const token_id = JSON.parse(Buffer.from(result.status.SuccessValue, 'base64').toString('utf-8'));
    console.log('token id is', token_id);

    const tokenBeforeTransfer = await devAccount.viewFunction(contractName,'nft_token',{token_id: ''+token_id});
    assert.strictEqual(tokenBeforeTransfer.owner_id, signer1AccountId);

    result = await account1.functionCall(contractName, 'nft_transfer', {
        receiver_id: signer2AccountId, token_id,
        token_id: '' + token_id,
        approval_id: '0',
        memo: null
      }, null, '1');

      const tokenAfterTransfer = await devAccount.viewFunction(contractName,'nft_token',{token_id: ''+token_id});
      assert.strictEqual(tokenAfterTransfer.owner_id, signer2AccountId);

      const tokensForOwner = await devAccount.viewFunction(contractName,'nft_tokens_for_owner',{account_id: ''+signer2AccountId, from_index: '0', limit: 0});
      assert.ok(tokensForOwner.length > 0);
      assert.strictEqual(tokensForOwner[0].owner_id, signer2AccountId);
      assert.strictEqual(tokensForOwner[0].id, token_id + '');
      assert.strictEqual(tokensForOwner[0].metadata.media, `https://${contractName}.page/nftimage/${token_id}.svg`);

      const nftimageresponse = await devAccount.viewFunction(contractName,'web4_get',{request: {path: new URL(tokensForOwner[0].metadata.media).pathname}});      
      assert.ok(Buffer.from(nftimageresponse.body,'base64').toString().indexOf('>#'+token_id+'</text>')>-1);
  });
});
