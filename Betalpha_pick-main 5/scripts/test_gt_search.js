
async function main() {
    const symbol = 'FLUID';

    console.log('--- Test 1: Search with network=eth ---');
    try {
        const res1 = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${symbol}&network=eth`);
        const data1 = await res1.json();
        const top1 = data1.data?.[0];
        if (top1) {
            console.log(`Found: ${top1.attributes.name} on ${top1.attributes.network?.identifier || 'eth'} (Price: ${top1.attributes.base_token_price_usd})`);
        } else {
            console.log('No results found on ETH.');
        }
    } catch (e) { console.error(e.message); }

    console.log('\n--- Test 2: Search WITHOUT network param ---');
    try {
        const res2 = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${symbol}`);
        const data2 = await res2.json();
        const top2 = data2.data?.[0];
        if (top2) {
            console.log(`Found: ${top2.attributes.name} on ${top2.attributes.network?.identifier} (Price: ${top2.attributes.base_token_price_usd})`);
            // Print top 3 to see if Solana is there
            data2.data.slice(0, 5).forEach((p, i) => {
                // Attributes usually contain name, address, base_token_price_usd, quote_token_price_usd, etc.
                // We need to check if there is a 'symbol' field in relationships or attributes.
                // GT API usually returns 'name' like "FLUID / WETH".
                // Let's dump the whole attribute keys to see what we have.
                console.log(`  #${i + 1}: ${p.attributes.name} ($${p.attributes.base_token_price_usd})`);
                // console.log(Object.keys(p.attributes));
            });
        } else {
            console.log('No results found globally.');
        }
    } catch (e) { console.error(e.message); }
}

main();
