const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../utils/authMiddleware');

// All agent endpoints require authentication
router.use(authMiddleware);

// Chat with the AI Agent
router.post('/chat', agentController.chat);

// Manage Action Proposals (Budget Updates)
router.get('/proposals', agentController.listProposals);
router.get('/proposals/:proposal_id', agentController.getProposal);
router.post('/proposals/:proposal_id/approve', agentController.approveProposal);
router.post('/proposals/:proposal_id/reject', agentController.rejectProposal);

module.exports = router;
