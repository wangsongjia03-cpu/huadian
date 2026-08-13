(() => {
  'use strict'

  const CARD = { width: 1228, height: 1608 }
  const ASSET_OFFSET_Y = -90
  const POLAROID = { x: 122, y: 237, width: 985, height: 1254 }
  const PHOTO = { x: 190, y: 360, width: 858, height: 840 }
  const MAT = { x: 213, y: 449, width: 802, height: 560 }
  const TEXT = {
    x: 243,
    y: 1248,
    width: 554,
    height: 130,
    fontSize: 34,
    fontWeight: 400,
    lineHeight: 64,
    letterSpacing: 3,
    maxLines: 2
  }
  const FONT_FAMILY = '"Yozai", "STKaiti", "KaiTi", serif'
  const WRITING_LINES = { x: 213, width: 614 }
  const WRITING_LINE_COLOR = 'rgba(75, 101, 130, 0.5)'

  const elements = {
    editorPage: document.querySelector('#editorPage'),
    resultPage: document.querySelector('#resultPage'),
    cardPreview: document.querySelector('#cardPreview'),
    photoInput: document.querySelector('#photoInput'),
    photoWindow: document.querySelector('#photoWindow'),
    editablePhoto: document.querySelector('#editablePhoto'),
    photoPlaceholder: document.querySelector('#photoPlaceholder'),
    photoToolbar: document.querySelector('#photoToolbar'),
    chooseText: document.querySelector('#chooseText'),
    zoomOutButton: document.querySelector('#zoomOutButton'),
    zoomInButton: document.querySelector('#zoomInButton'),
    resetButton: document.querySelector('#resetButton'),
    messageInput: document.querySelector('#messageInput'),
    messagePreview: document.querySelector('#messagePreview'),
    characterCount: document.querySelector('#characterCount'),
    colorOptions: document.querySelector('#colorOptions'),
    generateButton: document.querySelector('#generateButton'),
    editButton: document.querySelector('#editButton'),
    downloadButton: document.querySelector('#downloadButton'),
    shareButton: document.querySelector('#shareButton'),
    resultImage: document.querySelector('#resultImage'),
    generatingMask: document.querySelector('#generatingMask'),
    toast: document.querySelector('#toast'),
    canvas: document.querySelector('#posterCanvas')
  }

  const state = {
    photoImage: null,
    photoObjectUrl: '',
    resultDataUrl: '',
    selectedColor: '#173B89',
    transform: null,
    gesture: null,
    pointers: new Map(),
    assets: {}
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  function showToast(message) {
    window.clearTimeout(showToast.timer)
    elements.toast.textContent = message
    elements.toast.hidden = false
    showToast.timer = window.setTimeout(() => {
      elements.toast.hidden = true
    }, 2400)
  }

  function updatePreviewScale() {
    const width = elements.cardPreview.getBoundingClientRect().width
    elements.cardPreview.style.setProperty('--card-scale', String(width / CARD.width))
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`图片加载失败：${src}`))
      image.src = src
    })
  }

  async function preloadAssets() {
    const [background, overlay] = await Promise.all([
      loadImage('./card-background.png'),
      loadImage('./card-overlay.png')
    ])
    state.assets = { background, overlay }
  }

  function initializePhotoTransform() {
    if (!state.photoImage) return
    const imageWidth = state.photoImage.naturalWidth
    const imageHeight = state.photoImage.naturalHeight
    const coverScale = Math.max(PHOTO.width / imageWidth, PHOTO.height / imageHeight)
    const baseWidth = imageWidth * coverScale
    const baseHeight = imageHeight * coverScale

    state.transform = {
      baseWidth,
      baseHeight,
      scale: 1,
      offsetX: (PHOTO.width - baseWidth) / 2,
      offsetY: (PHOTO.height - baseHeight) / 2
    }
    applyPhotoTransform()
  }

  function applyPhotoTransform(next = {}) {
    if (!state.transform) return
    Object.assign(state.transform, next)
    const transform = state.transform
    const renderedWidth = transform.baseWidth * transform.scale
    const renderedHeight = transform.baseHeight * transform.scale

    transform.offsetX = clamp(transform.offsetX, PHOTO.width - renderedWidth, 0)
    transform.offsetY = clamp(transform.offsetY, PHOTO.height - renderedHeight, 0)

    elements.editablePhoto.style.width = `${transform.baseWidth / PHOTO.width * 100}%`
    elements.editablePhoto.style.height = `${transform.baseHeight / PHOTO.height * 100}%`
    elements.editablePhoto.style.left = `${transform.offsetX / PHOTO.width * 100}%`
    elements.editablePhoto.style.top = `${transform.offsetY / PHOTO.height * 100}%`
    elements.editablePhoto.style.transform = `scale(${transform.scale})`
  }

  async function choosePhoto(event) {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      return
    }

    const nextUrl = URL.createObjectURL(file)
    try {
      const image = await loadImage(nextUrl)
      if (state.photoObjectUrl) URL.revokeObjectURL(state.photoObjectUrl)
      state.photoObjectUrl = nextUrl
      state.photoImage = image
      elements.editablePhoto.src = nextUrl
      elements.editablePhoto.style.display = 'block'
      elements.photoPlaceholder.hidden = true
      elements.photoToolbar.hidden = false
      elements.photoWindow.classList.remove('photo-window-empty')
      elements.photoWindow.removeAttribute('for')
      elements.chooseText.textContent = '更换照片'
      initializePhotoTransform()
    } catch (error) {
      URL.revokeObjectURL(nextUrl)
      console.error(error)
      showToast('照片读取失败，请更换一张图片')
    } finally {
      elements.photoInput.value = ''
    }
  }

  function zoomPhoto(factor) {
    if (!state.transform) return
    const transform = state.transform
    const nextScale = clamp(transform.scale * factor, 1, 3)
    const ratio = nextScale / transform.scale
    const centerX = PHOTO.width / 2
    const centerY = PHOTO.height / 2

    applyPhotoTransform({
      scale: nextScale,
      offsetX: centerX - (centerX - transform.offsetX) * ratio,
      offsetY: centerY - (centerY - transform.offsetY) * ratio
    })
  }

  function pointerDistance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y)
  }

  function beginGesture() {
    if (!state.transform) return
    const points = Array.from(state.pointers.values())
    if (points.length >= 2) {
      const first = points[0]
      const second = points[1]
      const rect = elements.photoWindow.getBoundingClientRect()
      const centerClientX = (first.x + second.x) / 2
      const centerClientY = (first.y + second.y) / 2
      state.gesture = {
        type: 'pinch',
        startDistance: pointerDistance(first, second),
        startScale: state.transform.scale,
        startOffsetX: state.transform.offsetX,
        startOffsetY: state.transform.offsetY,
        centerX: (centerClientX - rect.left) * PHOTO.width / rect.width,
        centerY: (centerClientY - rect.top) * PHOTO.height / rect.height
      }
      return
    }

    if (points.length === 1) {
      state.gesture = {
        type: 'drag',
        startX: points[0].x,
        startY: points[0].y,
        startOffsetX: state.transform.offsetX,
        startOffsetY: state.transform.offsetY
      }
      return
    }
    state.gesture = null
  }

  function onPointerDown(event) {
    if (!state.photoImage) return
    event.preventDefault()
    elements.photoWindow.setPointerCapture?.(event.pointerId)
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    beginGesture()
  }

  function onPointerMove(event) {
    if (!state.pointers.has(event.pointerId) || !state.gesture || !state.transform) return
    event.preventDefault()
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = Array.from(state.pointers.values())
    const rect = elements.photoWindow.getBoundingClientRect()

    if (state.gesture.type === 'pinch' && points.length >= 2) {
      const distance = pointerDistance(points[0], points[1])
      const nextScale = clamp(
        state.gesture.startScale * distance / Math.max(1, state.gesture.startDistance),
        1,
        3
      )
      const ratio = nextScale / state.gesture.startScale
      applyPhotoTransform({
        scale: nextScale,
        offsetX: state.gesture.centerX - (state.gesture.centerX - state.gesture.startOffsetX) * ratio,
        offsetY: state.gesture.centerY - (state.gesture.centerY - state.gesture.startOffsetY) * ratio
      })
      return
    }

    if (state.gesture.type === 'drag' && points.length === 1) {
      applyPhotoTransform({
        offsetX: state.gesture.startOffsetX + (points[0].x - state.gesture.startX) * PHOTO.width / rect.width,
        offsetY: state.gesture.startOffsetY + (points[0].y - state.gesture.startY) * PHOTO.height / rect.height
      })
    }
  }

  function onPointerEnd(event) {
    state.pointers.delete(event.pointerId)
    beginGesture()
  }

  function updateMessage() {
    const message = elements.messageInput.value
    elements.messagePreview.textContent = message || '写下想对未来说的话'
    elements.characterCount.textContent = `${Array.from(message).length} / 30`
  }

  function selectColor(event) {
    const button = event.target.closest('[data-color]')
    if (!button) return
    state.selectedColor = button.dataset.color
    elements.messagePreview.style.color = state.selectedColor
    elements.colorOptions.querySelectorAll('[data-color]').forEach((item) => {
      const selected = item === button
      item.classList.toggle('selected', selected)
      item.setAttribute('aria-checked', String(selected))
    })
  }

  function measureTextWithSpacing(ctx, text, letterSpacing) {
    const characters = Array.from(text)
    if (!characters.length) return 0
    return characters.reduce((width, character) => width + ctx.measureText(character).width, 0) +
      Math.max(0, characters.length - 1) * letterSpacing
  }

  function wrapText(ctx, text, maxWidth, maxLines, letterSpacing = 0) {
    const lines = []
    text.split(/\n+/).forEach((paragraph) => {
      let current = ''
      Array.from(paragraph).forEach((character) => {
        const candidate = current + character
        if (current && measureTextWithSpacing(ctx, candidate, letterSpacing) > maxWidth) {
          lines.push(current)
          current = character
        } else {
          current = candidate
        }
      })
      if (current) lines.push(current)
    })

    if (lines.length <= maxLines) return lines
    const visible = lines.slice(0, maxLines)
    let last = visible[maxLines - 1]
    while (last && measureTextWithSpacing(ctx, `${last}…`, letterSpacing) > maxWidth) {
      last = Array.from(last).slice(0, -1).join('')
    }
    visible[maxLines - 1] = `${last}…`
    return visible
  }

  function drawWritingLines(ctx) {
    ctx.save()
    ctx.beginPath()
    for (let index = 0; index <= TEXT.maxLines; index += 1) {
      const lineY = TEXT.y + index * TEXT.lineHeight
      ctx.moveTo(WRITING_LINES.x, lineY)
      ctx.lineTo(WRITING_LINES.x + WRITING_LINES.width, lineY)
    }
    ctx.strokeStyle = WRITING_LINE_COLOR
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  function drawMessage(ctx, message) {
    ctx.save()
    ctx.fillStyle = state.selectedColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = `${TEXT.fontWeight} ${TEXT.fontSize}px ${FONT_FAMILY}`
    const lines = wrapText(ctx, message, TEXT.width, TEXT.maxLines, TEXT.letterSpacing)
    const startY = TEXT.y + 24
    lines.forEach((line, index) => {
      const characters = Array.from(line)
      const glyphWidth = characters.reduce(
        (width, character) => width + ctx.measureText(character).width,
        0
      )
      const isCompleteLine = index < lines.length - 1 && characters.length > 1
      const gap = isCompleteLine
        ? Math.max(TEXT.letterSpacing, (TEXT.width - glyphWidth) / (characters.length - 1))
        : TEXT.letterSpacing
      const naturalWidth = glyphWidth + Math.max(0, characters.length - 1) * gap
      let cursorX = isCompleteLine
        ? TEXT.x
        : TEXT.x + (TEXT.width - naturalWidth) / 2
      characters.forEach((character) => {
        ctx.fillText(character, cursorX, startY + index * TEXT.lineHeight)
        cursorX += ctx.measureText(character).width + gap
      })
    })
    ctx.restore()
  }

  function canvasToDataUrl(canvas) {
    // 微信的原生“长按保存”无法稳定读取 blob: 临时地址。
    // 使用体积较小的 JPEG data URL，让结果图片本身携带完整高清数据。
    const dataUrl = canvas.toDataURL('image/jpeg', 0.96)
    if (!dataUrl || !dataUrl.startsWith('data:image/jpeg')) {
      throw new Error('图片导出失败')
    }
    return dataUrl
  }

  function setResultImage(dataUrl) {
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error) => {
        if (settled) return
        settled = true
        elements.resultImage.onload = null
        elements.resultImage.onerror = null
        if (error) reject(error)
        else resolve()
      }
      elements.resultImage.onload = () => finish()
      elements.resultImage.onerror = () => finish(new Error('结果图片显示失败'))
      elements.resultImage.src = dataUrl
      if (elements.resultImage.complete && elements.resultImage.naturalWidth) finish()
    })
  }

  async function generateCard() {
    const message = elements.messageInput.value.trim()
    if (!state.photoImage || !state.transform) {
      showToast('请先选择一张照片')
      return
    }
    if (!message) {
      showToast('请填写卡片寄语')
      return
    }

    elements.generatingMask.hidden = false
    elements.generateButton.disabled = true
    const start = Date.now()

    try {
      if (!state.assets.background) await preloadAssets()
      if (document.fonts?.load) {
        const loadedFonts = await document.fonts.load(`${TEXT.fontSize}px "Yozai"`, message)
        if (!loadedFonts.length) throw new Error('手写字体加载失败')
      }
      if (document.fonts?.ready) await document.fonts.ready

      const canvas = elements.canvas
      const ctx = canvas.getContext('2d')
      canvas.width = CARD.width
      canvas.height = CARD.height
      ctx.clearRect(0, 0, CARD.width, CARD.height)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, CARD.width, CARD.height)
      ctx.drawImage(state.assets.background, 0, ASSET_OFFSET_Y)

      ctx.save()
      ctx.shadowColor = 'rgba(37, 50, 64, 0.22)'
      ctx.shadowBlur = 32
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 20
      ctx.fillStyle = '#fff'
      ctx.fillRect(POLAROID.x, POLAROID.y, POLAROID.width, POLAROID.height)
      ctx.restore()

      ctx.fillStyle = '#fff'
      ctx.fillRect(MAT.x, MAT.y, MAT.width, MAT.height)

      const transform = state.transform
      ctx.save()
      ctx.beginPath()
      ctx.rect(PHOTO.x, PHOTO.y, PHOTO.width, PHOTO.height)
      ctx.clip()
      ctx.drawImage(
        state.photoImage,
        PHOTO.x + transform.offsetX,
        PHOTO.y + transform.offsetY,
        transform.baseWidth * transform.scale,
        transform.baseHeight * transform.scale
      )
      ctx.restore()

      ctx.drawImage(state.assets.overlay, 0, ASSET_OFFSET_Y)
      drawWritingLines(ctx)
      drawMessage(ctx, message)

      state.resultDataUrl = canvasToDataUrl(canvas)
      await setResultImage(state.resultDataUrl)

      const delay = Math.max(0, 650 - (Date.now() - start))
      if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
      elements.editorPage.hidden = true
      elements.resultPage.hidden = false
      window.scrollTo({ top: 0, behavior: 'auto' })
    } catch (error) {
      console.error(error)
      showToast('生成失败，请更换一张尺寸较小的照片')
    } finally {
      elements.generatingMask.hidden = true
      elements.generateButton.disabled = false
    }
  }

  function editAgain() {
    elements.resultPage.hidden = true
    elements.editorPage.hidden = false
    window.scrollTo({ top: 0, behavior: 'auto' })
    requestAnimationFrame(updatePreviewScale)
  }

  function downloadResult() {
    if (!state.resultDataUrl) return
    if (/MicroMessenger/i.test(navigator.userAgent)) {
      elements.resultImage.scrollIntoView({ behavior: 'smooth', block: 'center' })
      showToast('请长按卡片，选择“保存到手机”')
      return
    }
    const link = document.createElement('a')
    link.href = state.resultDataUrl
    link.download = `华电迎新纪念卡-${Date.now()}.jpg`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function sharePage() {
    const shareData = {
      title: '华电迎新纪念卡',
      text: '上传照片，生成你的迎新纪念卡。',
      url: window.location.href
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
        showToast('制作链接已复制')
        return
      }
      window.prompt('复制下面的制作链接', window.location.href)
    } catch (error) {
      if (error.name !== 'AbortError') showToast('请复制浏览器地址分享')
    }
  }

  elements.photoInput.addEventListener('change', choosePhoto)
  elements.photoWindow.addEventListener('pointerdown', onPointerDown)
  elements.photoWindow.addEventListener('pointermove', onPointerMove)
  elements.photoWindow.addEventListener('pointerup', onPointerEnd)
  elements.photoWindow.addEventListener('pointercancel', onPointerEnd)
  elements.zoomOutButton.addEventListener('click', () => zoomPhoto(1 / 1.18))
  elements.zoomInButton.addEventListener('click', () => zoomPhoto(1.18))
  elements.resetButton.addEventListener('click', initializePhotoTransform)
  elements.messageInput.addEventListener('input', updateMessage)
  elements.colorOptions.addEventListener('click', selectColor)
  elements.generateButton.addEventListener('click', generateCard)
  elements.editButton.addEventListener('click', editAgain)
  elements.downloadButton.addEventListener('click', downloadResult)
  elements.shareButton.addEventListener('click', sharePage)
  window.addEventListener('resize', updatePreviewScale)
  if ('ResizeObserver' in window) {
    new ResizeObserver(updatePreviewScale).observe(elements.cardPreview)
  }

  updatePreviewScale()
  updateMessage()
  preloadAssets().catch(console.error)
})()
