const { ethers } = require('ethers');

(async () => {
  console.log('Testing with trailing slash:');
  const provider1 = new ethers.JsonRpcProvider('https://mainnet.base.org/');
  const contract1 = new ethers.Contract(
    '0x40200001004B5110333e4De8179426971Efd034A',
    ['function getNonce(address user, address token) view returns (uint256)'],
    provider1
  );
  
  try {
    const nonce1 = await contract1.getNonce('0x35f349Bd50884E117f3135Bb2958E79f6b1a5aB7', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    console.log('✅ With slash works:', nonce1.toString());
  } catch (error) {
    console.log('❌ With slash failed:', error.message);
  }

  console.log('\nTesting without trailing slash:');
  const provider2 = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const contract2 = new ethers.Contract(
    '0x40200001004B5110333e4De8179426971Efd034A',
    ['function getNonce(address user, address token) view returns (uint256)'],
    provider2
  );
  
  try {
    const nonce2 = await contract2.getNonce('0x35f349Bd50884E117f3135Bb2958E79f6b1a5aB7', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    console.log('✅ Without slash works:', nonce2.toString());
  } catch (error) {
    console.log('❌ Without slash failed:', error.message);
  }
})();