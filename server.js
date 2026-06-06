const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js'); // Added Discord Bot Client

const app = express();
const PORT = process.env.PORT || 3000;

// 1. THIS KEEPS YOUR WEB CALLBACK RUNNING
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');
    try {
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: '1512761665719111892', 
            client_secret: process.env.DISCORD_SECRET, 
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://v4gueportfolio-github-io.onrender.com/callback'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.send('Bot authorized successfully! You can close this tab now, Shafir.');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('OAuth2 Exchange Failed');
    }
});

app.listen(PORT, () => console.log(`Web server blasting on port ${PORT}`));

// 2. THIS FORCES YOUR BOT TO GO ONLINE 24/7
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
    console.log(`Boom! ${client.user.tag} is officially ONLINE! 🥀`);
});

// Logs the bot user into the Discord gateway using a hidden bot token
client.login(process.env.DISCORD_TOKEN);
