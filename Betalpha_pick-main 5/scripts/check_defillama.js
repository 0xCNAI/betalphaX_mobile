
import https from 'https';

function fetchProtocols() {
    return new Promise((resolve, reject) => {
        https.get('https://api.llama.fi/protocols', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function findSanctum() {
    try {
        console.log("Fetching protocols...");
        const protocols = await fetchProtocols();
        console.log(`Fetched ${protocols.length} protocols.`);

        const matches = protocols.filter(p =>
            p.symbol === 'CLOUD' ||
            p.name.toLowerCase().includes('sanctum')
        );

        console.log("\nMatches found:");
        matches.forEach(p => {
            console.log(`Name: ${p.name}, Symbol: ${p.symbol}, Slug: ${p.slug}, TVL: ${p.tvl}`);
        });

    } catch (error) {
        console.error("Error:", error);
    }
}

findSanctum();
