import React, { useState, useEffect } from 'react'
import { Layout, Spin, message, Button, Tooltip } from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import Sidebar from './components/Sidebar'
import StepDetail from './pages/StepDetail'
import Terminal from './components/Terminal'
import { fetchContentStructure } from './services/api'

const { Sider, Content } = Layout

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [structure, setStructure] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null) // { weekId, stepId }

  useEffect(() => {
    loadContent()
  }, [])

  const loadContent = async () => {
    try {
      setLoading(true)
      const data = await fetchContentStructure()
      setStructure(data)

      if (data.weeks?.length > 0 && data.weeks[0].steps?.length > 0) {
        const firstWeek = data.weeks[0]
        const firstStep = firstWeek.steps[0]
        setSelectedItem({ weekId: firstWeek.id, stepId: firstStep.id })
      }
    } catch (error) {
      message.error('加载内容失败:' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncContent = async () => {
    try {
      setSyncing(true)
      const data = await fetchContentStructure(true)
      setStructure(data)
      message.success('文档同步成功')
    } catch (error) {
      message.error('同步失败: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleSelect = (weekId, stepId) => {
    setSelectedItem({ weekId, stepId })
  }

  if (loading) {
    return (
      <div className="tw-h-screen tw-flex tw-items-center tw-justify-center">
        <Spin size="large" tip="加载中...">
          <div className="tw-p-12" />
        </Spin>
      </div>
    )
  }

  return (
    <Layout className="tw-h-screen tw-overflow-hidden">
      {/* 顶部拖拽区域 */}
      <div className="app-drag-region tw-h-9 tw-flex-shrink-0 tw-bg-gray-100 tw-border-b tw-border-gray-200" />

      <Layout className="tw-flex-1 tw-overflow-hidden">
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={280}
          collapsedWidth={80}
          className="tw-bg-white tw-border-r tw-border-gray-200 tw-flex tw-flex-col"
          theme="light"
        >
          <div className="tw-h-full tw-flex tw-flex-col tw-min-h-0">
            <div className="tw-h-12 tw-flex tw-items-center tw-justify-between tw-px-3 tw-border-b tw-border-gray-200 tw-flex-shrink-0">
              <span className="tw-font-bold tw-text-lg tw-truncate">{collapsed ? 'LLM' : structure?.title || 'LLM 学习'}</span>
              {!collapsed && (
                <Tooltip title="同步文档">
                  <Button
                    type="text"
                    size="small"
                    icon={<SyncOutlined spin={syncing} />}
                    onClick={handleSyncContent}
                    loading={syncing}
                  />
                </Tooltip>
              )}
            </div>
            <div className="tw-flex-1 tw-min-h-0 tw-overflow-y-auto">
              <Sidebar structure={structure} selectedItem={selectedItem} onSelect={handleSelect} collapsed={collapsed} />
            </div>
          </div>
        </Sider>

        {/* 主内容区域 - 包含详情和终端 */}
        <Content className="tw-flex-1 tw-overflow-hidden tw-bg-gray-50 tw-relative">
          <div className="tw-h-full tw-flex">
            {/* 左侧详情区域 - 60% 宽度 */}
            <div className="tw-w-3/5 tw-h-full tw-flex tw-flex-col tw-overflow-hidden">
              {selectedItem ? (
                <StepDetail weekId={selectedItem.weekId} stepId={selectedItem.stepId} />
              ) : (
                <div className="tw-h-full tw-flex tw-items-center tw-justify-center tw-text-gray-400">
                  请从左侧选择学习内容
                </div>
              )}
            </div>

            {/* 右侧终端区域 - 40% 宽度，悬浮样式 */}
            <div className="tw-w-2/5 tw-h-full tw-p-3 tw-pl-0">
              <div className="tw-h-full tw-bg-gray-900 tw-rounded-lg tw-shadow-lg tw-overflow-hidden tw-flex tw-flex-col tw-border tw-border-gray-700">
                {/* 终端标题栏 */}
                <div className="tw-h-8 tw-bg-gray-800 tw-flex tw-items-center tw-px-3 tw-flex-shrink-0 tw-border-b tw-border-gray-700">
                  <div className="tw-flex tw-gap-1.5">
                    <span className="tw-w-3 tw-h-3 tw-rounded-full tw-bg-red-500" />
                    <span className="tw-w-3 tw-h-3 tw-rounded-full tw-bg-yellow-500" />
                    <span className="tw-w-3 tw-h-3 tw-rounded-full tw-bg-green-500" />
                  </div>
                  <span className="tw-text-gray-400 tw-text-xs tw-ml-3">Terminal</span>
                </div>
                {/* 终端内容 - 独立滚动 */}
                <div className="tw-flex-1 tw-overflow-hidden terminal-container">
                  <Terminal />
                </div>
              </div>
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
