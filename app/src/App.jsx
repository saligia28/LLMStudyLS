import React, { useState, useEffect } from 'react'
import { Layout, Spin, message } from 'antd'
import Sidebar from './components/Sidebar'
import StepDetail from './pages/StepDetail'
import Terminal from './components/Terminal'
import { fetchContentStructure } from './services/api'

const { Sider, Content } = Layout

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
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

  const handleSelect = (weekId, stepId) => {
    setSelectedItem({ weekId, stepId })
  }

  if (loading) {
    return (
      <div className="tw-h-screen tw-flex tw-items-center tw-justify-center">
        <Spin size="large" tip="加载中..."></Spin>
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
          style={{ height: '100%', overflow: 'hidden' }}
        >
          <div className="tw-h-12 tw-flex tw-items-center tw-justify-center tw-border-b tw-border-gray-200 tw-flex-shrink-0">
            <span className="tw-font-bold tw-text-lg">{collapsed ? 'LLM' : structure?.title || 'LLM 学习'}</span>
          </div>
          <div className="tw-flex-1 tw-overflow-y-auto">
            <Sidebar structure={structure} selectedItem={selectedItem} onSelect={handleSelect} collapsed={collapsed} />
          </div>
        </Sider>

        <Layout className="tw-flex tw-flex-col tw-overflow-hidden">
          {/* 主内容区 - 可滚动 */}
          <Content className="tw-flex-1 tw-overflow-auto tw-bg-gray-50 tw-p-4">
            {selectedItem ? (
              <StepDetail weekId={selectedItem.weekId} stepId={selectedItem.stepId} />
            ) : (
              <div className="tw-h-full tw-flex tw-items-center tw-justify-center tw-text-gray-400">
                请从左侧选择学习内容
              </div>
            )}
          </Content>

          {/* 终端区 - 固定高度 */}
          <div className="tw-h-64 tw-flex-shrink-0 tw-bg-black tw-border-t tw-border-gray-300">
            <Terminal />
          </div>
        </Layout>
      </Layout>
    </Layout>
  )
}

export default App
