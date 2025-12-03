
const API_KEY = 'new1_f96fb36ea3274017be61efe351c31c5c';
const TWITTER_API_BASE = 'https://api.twitterapi.io/twitter/tweet';

async function testFetch() {
    const query = '($ETH OR Ethereum) min_faves:5 lang:en -filter:retweets';
    const url = `${TWITTER_API_BASE}/advanced_search?query=${encodeURIComponent(query)}&type=Top`;

    console.log('Fetching from:', url);

    try {
        const response = await fetch(url, {
            headers: {
                'X-API-Key': API_KEY
            }
        });

        if (!response.ok) {
            console.error('Error:', response.status, await response.text());
            return;
        }

        const data = await response.json();
        console.log('--- RAW API RESPONSE (First 2 Tweets) ---');
        if (data.tweets && data.tweets.length > 0) {
            console.log(JSON.stringify(data.tweets.slice(0, 2), null, 2));
        } else {
            console.log('No tweets found.');
        }

    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

testFetch();
