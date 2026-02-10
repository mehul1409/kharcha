const HEALTH_URL = 'https://kharcha-l5ur.onrender.com/health';

(async () => {
  try {
    console.log('Cron job started:', new Date().toISOString());

    const response = await fetch(HEALTH_URL, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const text = await response.text();
    console.log('✅ Server is alive');
    console.log('Response:', text);

  } catch (error) {
    console.error('❌ Health check failed');
    console.error(error.message);
    process.exit(1);
  }
})();
