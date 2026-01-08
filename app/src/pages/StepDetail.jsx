import React, { useState, useEffect, useCallback } from 'react'
import { Tabs, Card, Slider, InputNumber, Button, Space, Spin, Select, message } from 'antd'
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchStepDetail, fetchCodeContent } from '../services/api'

function StepDetail({ weekId, stepId }) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [selectedCode, setSelectedCode] = useState(null)
  const [codeContent, setCodeContent] = useState('')
  const [params, setParams] = useState({
    temperature: 0.7,
    max_tokens: 500,
  })

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchStepDetail(weekId, stepId)
      setDetail(data)

      // 默认选中第一个代码文件
      if (data.codeFiles?.length > 0) {
        setSelectedCode(data.codeFiles[0])
        const content = await fetchCodeContent(data.codeFiles[0].path)
        setCodeContent(content)
      } else {
        setSelectedCode(null)
        setCodeContent('')
      }
    } catch (error) {
      message.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [weekId, stepId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const handleCodeSelect = async file => {
    setSelectedCode(file)
    try {
      const content = await fetchCodeContent(file.path)
      setCodeContent(content)
    } catch (error) {
      message.error('加载代码失败')
    }
  }

  const handleRunCode = () => {
    if (!selectedCode || !window.electronAPI?.terminal) {
      message.warning('请先选择代码文件')
      return
    }

    // 构建运行命令
    const cmd = `node "${selectedCode.path}"\n`
    window.electronAPI.terminal.write(cmd)
  }

  if (loading) {
    return (
      <div className="tw-h-full tw-flex tw-items-center tw-justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (!detail) {
    return <div className="tw-h-full tw-flex tw-items-center tw-justify-center tw-text-gray-400">内容加载失败</div>
  }

  return (
    <div className="tw-h-full tw-flex tw-flex-col tw-overflow-hidden">
      {/* 顶部标题 - 固定 */}
      <div className="tw-flex-shrink-0 tw-bg-gray-50 tw-pb-2">
        <h2 className="tw-text-xl tw-font-bold tw-m-0">{detail.title}</h2>
        {detail.description && <p className="tw-text-gray-500 tw-mt-1 tw-mb-0">{detail.description}</p>}
      </div>

      {/* Tabs - 使用flex布局 */}
      <Tabs
        className="tw-flex-1 tw-min-h-0 tw-flex tw-flex-col step-detail-tabs"
        items={[
          {
            key: 'doc',
            label: '学习文档',
            children: (
              <div className="tw-h-full tw-overflow-auto tw-bg-white tw-rounded-lg tw-p-6">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.docContent}</ReactMarkdown>
                </div>
              </div>
            ),
          },
          {
            key: 'code',
            label: '代码实践',
            children: (
              <div className="tw-h-full tw-flex tw-gap-4 tw-overflow-hidden">
                {/* 代码区 */}
                <div className="tw-flex-1 tw-flex tw-flex-col tw-bg-white tw-rounded-lg tw-overflow-hidden tw-min-w-0">
                  {/* 工具栏 - 固定 */}
                  <div className="tw-p-3 tw-border-b tw-flex tw-items-center tw-justify-between tw-flex-shrink-0 tw-bg-white">
                    <Select
                      value={selectedCode?.name}
                      onChange={(_, option) => handleCodeSelect(option.file)}
                      style={{ width: 200 }}
                      placeholder="选择代码文件"
                      options={detail.codeFiles?.map(f => ({
                        value: f.name,
                        label: f.name,
                        file: f,
                      }))}
                    />
                    <Space>
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={handleRunCode}
                        disabled={!selectedCode}
                      >
                        运行
                      </Button>
                    </Space>
                  </div>
                  {/* 代码内容 - 可滚动 */}
                  <pre className="tw-flex-1 tw-m-0 tw-p-4 tw-overflow-auto tw-bg-gray-50 tw-text-sm">
                    <code>{codeContent || '// 请选择代码文件'}</code>
                  </pre>
                </div>

                {/* 参数控制面板 - 固定宽度，不滚动 */}
                {detail.canManual && (
                  <div className="tw-w-72 tw-flex-shrink-0">
                    <Card title="参数控制" size="small" className="tw-sticky tw-top-0">
                      <div className="tw-space-y-4">
                        <div>
                          <label className="tw-block tw-text-sm tw-mb-1">Temperature: {params.temperature}</label>
                          <Slider
                            min={0}
                            max={2}
                            step={0.1}
                            value={params.temperature}
                            onChange={v => setParams(p => ({ ...p, temperature: v }))}
                          />
                          <p className="tw-text-xs tw-text-gray-400 tw-mt-1">控制输出随机性 (0=确定, 2=随机)</p>
                        </div>

                        <div>
                          <label className="tw-block tw-text-sm tw-mb-1">Max Tokens</label>
                          <InputNumber
                            min={1}
                            max={4096}
                            value={params.max_tokens}
                            onChange={v => setParams(p => ({ ...p, max_tokens: v }))}
                            className="tw-w-full"
                          />
                          <p className="tw-text-xs tw-text-gray-400 tw-mt-1">限制输出最大长度</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

export default StepDetail
