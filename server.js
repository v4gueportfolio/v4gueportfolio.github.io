const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) return res.status(400).send('No code provided');

    try {
        // Exchange code for access token safely using your hidden env secret
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: '1512761665719111892', 
            client_secret: process.env.DISCORD_SECRET, 
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://v4gueportfolio-github-io.onrender.com/callback' // <-- Change this to your exact Render URL
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log("Success! Token received:", response.data.access_token);
        res.send('Bot authorized successfully! You can close this tab now.');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('OAuth2 Exchange Failed');
    }
});

app.listen(PORT, () => console.log(`Server blasting on port ${PORT}`));
