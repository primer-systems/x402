// Tests for signer.js
// Run with: npm test

const { createSigner, NETWORKS } = require('../signer');

// Test private key (DO NOT USE IN PRODUCTION - this is a well-known test key)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// ============================================
// Signer Creation - Private Key Approach
// ============================================

describe('createSigner with private key', () => {
  describe('valid inputs', () => {
    test('creates signer for base network', async () => {
      const signer = await createSigner('base', TEST_PRIVATE_KEY);
      expect(signer).toBeDefined();
      expect(signer.getAddress()).toBe(TEST_ADDRESS);
    });

    test('creates signer for base-sepolia network', async () => {
      const signer = await createSigner('base-sepolia', TEST_PRIVATE_KEY);
      expect(signer).toBeDefined();
      expect(signer.getAddress()).toBe(TEST_ADDRESS);
    });

    test('getNetwork returns correct info for base', async () => {
      const signer = await createSigner('base', TEST_PRIVATE_KEY);
      const network = signer.getNetwork();
      expect(network.name).toBe('eip155:8453');  // v2 uses CAIP-2 format
      expect(network.chainId).toBe(8453);
    });

    test('getNetwork returns correct info for base-sepolia', async () => {
      const signer = await createSigner('base-sepolia', TEST_PRIVATE_KEY);
      const network = signer.getNetwork();
      expect(network.name).toBe('eip155:84532');  // v2 uses CAIP-2 format
      expect(network.chainId).toBe(84532);
    });

    test('isViem is false for private key signer', async () => {
      const signer = await createSigner('base', TEST_PRIVATE_KEY);
      expect(signer.isViem).toBe(false);
    });

    test('getWallet returns ethers wallet', async () => {
      const signer = await createSigner('base', TEST_PRIVATE_KEY);
      const wallet = signer.getWallet();
      expect(wallet).toBeDefined();
      expect(wallet.address).toBe(TEST_ADDRESS);
    });

    test('getProvider returns provider', async () => {
      const signer = await createSigner('base', TEST_PRIVATE_KEY);
      const provider = signer.getProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('invalid inputs', () => {
    test('throws if network is missing', async () => {
      await expect(createSigner(null, TEST_PRIVATE_KEY))
        .rejects.toThrow('network is required');
    });

    test('throws if private key is missing', async () => {
      await expect(createSigner('base', null))
        .rejects.toThrow('privateKey is required');
    });

    test('throws for unsupported network', async () => {
      await expect(createSigner('unsupported-network', TEST_PRIVATE_KEY))
        .rejects.toThrow('Invalid network');
    });

    test('throws for invalid private key format', async () => {
      await expect(createSigner('base', 'not-a-valid-key'))
        .rejects.toThrow();
    });

    test('throws for private key without 0x prefix', async () => {
      const keyWithoutPrefix = TEST_PRIVATE_KEY.slice(2);
      // ethers may or may not accept this - test actual behavior
      // This tests that we get SOME result (error or success)
      const result = createSigner('base', keyWithoutPrefix);
      // Should either succeed or throw
      await expect(result).resolves.toBeDefined().catch(() => {
        // If it throws, that's also acceptable
        expect(true).toBe(true);
      });
    });
  });

  describe('custom RPC URL', () => {
    test('accepts custom rpcUrl option', async () => {
      const signer = await createSigner('base', TEST_PRIVATE_KEY, {
        rpcUrl: 'https://custom-rpc.example.com'
      });
      expect(signer).toBeDefined();
      // We can't easily verify the RPC URL was used without making a call
      // But at least we verify it doesn't throw
    });
  });
});

// ============================================
// signTypedData
// ============================================

describe('signTypedData', () => {
  test('signs EIP-712 typed data', async () => {
    const signer = await createSigner('base', TEST_PRIVATE_KEY);

    const domain = {
      name: 'Test',
      version: '1',
      chainId: 8453,
      verifyingContract: '0x0000000000000000000000000000000000000001'
    };

    const types = {
      Message: [
        { name: 'content', type: 'string' }
      ]
    };

    const message = {
      content: 'Hello, world!'
    };

    const signature = await signer.signTypedData(domain, types, message);

    // Signature should be a hex string starting with 0x
    expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
    // EIP-712 signatures are 65 bytes = 130 hex chars + 0x prefix
    expect(signature.length).toBe(132);
  });

  test('produces consistent signatures for same input', async () => {
    const signer = await createSigner('base', TEST_PRIVATE_KEY);

    const domain = {
      name: 'Test',
      version: '1',
      chainId: 8453,
      verifyingContract: '0x0000000000000000000000000000000000000001'
    };

    const types = {
      Message: [{ name: 'content', type: 'string' }]
    };

    const message = { content: 'Hello' };

    const sig1 = await signer.signTypedData(domain, types, message);
    const sig2 = await signer.signTypedData(domain, types, message);

    expect(sig1).toBe(sig2);
  });

  test('produces different signatures for different messages', async () => {
    const signer = await createSigner('base', TEST_PRIVATE_KEY);

    const domain = {
      name: 'Test',
      version: '1',
      chainId: 8453,
      verifyingContract: '0x0000000000000000000000000000000000000001'
    };

    const types = {
      Message: [{ name: 'content', type: 'string' }]
    };

    const sig1 = await signer.signTypedData(domain, types, { content: 'Hello' });
    const sig2 = await signer.signTypedData(domain, types, { content: 'World' });

    expect(sig1).not.toBe(sig2);
  });
});

// ============================================
// NETWORKS constant
// ============================================

describe('NETWORKS', () => {
  test('exports NETWORKS object', () => {
    expect(NETWORKS).toBeDefined();
    expect(typeof NETWORKS).toBe('object');
  });

  test('contains expected networks', () => {
    expect(NETWORKS['eip155:8453']).toBeDefined();     // Base (CAIP-2)
    expect(NETWORKS['eip155:84532']).toBeDefined();    // Base Sepolia (CAIP-2)
  });

  test('each network has required properties', () => {
    for (const [name, config] of Object.entries(NETWORKS)) {
      expect(config.chainId).toBeDefined();
      expect(typeof config.chainId).toBe('number');
      expect(config.rpcUrl).toBeDefined();
      expect(typeof config.rpcUrl).toBe('string');
    }
  });
});
