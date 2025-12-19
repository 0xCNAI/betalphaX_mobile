import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import StatsPanel from '../components/Monitor/StatsPanel';
import LogTable from '../components/Monitor/LogTable';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MonitorPage = () => {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // Subscribe to logs updates
        const q = query(
            collection(db, "gemini_logs"),
            orderBy("timestamp", "desc"),
            limit(500) // Limit to last 500 logs to prevent overload
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setLogs(logsData);
            calculateStats(logsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching logs:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const calculateStats = (logs) => {
        const totalCalls = logs.length;
        const successCount = logs.filter(log => log.status === 'success').length;
        const totalCost = logs.reduce((sum, log) => sum + (log.totalCostUsd || 0), 0);
        const avgLatency = totalCalls > 0
            ? logs.reduce((sum, log) => sum + (log.latencyMs || 0), 0) / totalCalls
            : 0;
        const totalInputTokens = logs.reduce((sum, log) => sum + (log.inputTokens || 0), 0);
        const totalOutputTokens = logs.reduce((sum, log) => sum + (log.outputTokens || 0), 0);

        // Feature breakdown
        const featureMap = {};
        logs.forEach(log => {
            if (!featureMap[log.feature]) {
                featureMap[log.feature] = {
                    feature: log.feature,
                    count: 0,
                    totalCost: 0,
                    totalLatency: 0
                };
            }
            featureMap[log.feature].count++;
            featureMap[log.feature].totalCost += log.totalCostUsd || 0;
            featureMap[log.feature].totalLatency += log.latencyMs || 0;
        });

        const featureBreakdown = Object.values(featureMap).map(item => ({
            ...item,
            avgLatency: item.count > 0 ? item.totalLatency / item.count : 0
        })).sort((a, b) => b.totalCost - a.totalCost);

        // Model breakdown
        const modelMap = {};
        logs.forEach(log => {
            if (!modelMap[log.model]) {
                modelMap[log.model] = {
                    model: log.model,
                    count: 0,
                    totalCost: 0
                };
            }
            modelMap[log.model].count++;
            modelMap[log.model].totalCost += log.totalCostUsd || 0;
        });

        const modelBreakdown = Object.values(modelMap).sort((a, b) => b.totalCost - a.totalCost);

        setStats({
            totalCalls,
            totalCost,
            avgLatency,
            successCount,
            totalInputTokens,
            totalOutputTokens,
            featureBreakdown,
            modelBreakdown
        });
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 pb-20">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="mr-4 p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                            Gemini API Monitor
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Real-time internal monitoring</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                ) : (
                    <>
                        <StatsPanel stats={stats} />
                        <LogTable logs={logs} />
                    </>
                )}
            </div>
        </div>
    );
};

export default MonitorPage;
