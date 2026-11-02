// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import type { ElementDimensions } from "../hooks/use-drag-resize"
import { useDragResize } from "../hooks/use-drag-resize"
import { ResizeHandle } from "./resize-handle"
import { cn } from "@/lib/utils"
import { ImageLightbox } from "./image-lightbox"
import { ActionButton, ActionWrapper, ImageActions } from "./image-actions"
import { useImageActions } from "../hooks/use-image-actions"
import { InfoCircle as InfoCircledIcon, Trash as TrashIcon } from '@/components/icons'
import { ImageOverlay } from "./image-overlay"
import { Spinner } from "../../../components/spinner"
import { useBlobImageUpload, type ImageState } from "../hooks/use-blob-image-upload"

const MAX_HEIGHT = 600
const MIN_HEIGHT = 120
const MIN_WIDTH = 120

interface ImageStatusProps {
  isServerUploading: boolean
  error: boolean
}

const ImageStatus: React.FC<ImageStatusProps> = ({
  isServerUploading,
  error,
}) => (
  <>
    {isServerUploading && !error && (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="size-7" />
      </div>
    )}

    {error && (
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <InfoCircledIcon className="text-destructive size-8" />
        <p className="text-muted-foreground mt-2 text-sm">
          Failed to load image
        </p>
      </div>
    )}
  </>
)

interface ImageResizeHandlesProps {
  isResizing: boolean
  activeResizeHandle: "left" | "right" | null
  onResizeStart: (
    direction: "left" | "right"
  ) => (event: React.PointerEvent<HTMLDivElement>) => void
}

const ImageResizeHandles: React.FC<ImageResizeHandlesProps> = ({
  isResizing,
  activeResizeHandle,
  onResizeStart,
}) => (
  <>
    <ResizeHandle
      onPointerDown={onResizeStart("left")}
      className={cn("left-1", {
        hidden: isResizing && activeResizeHandle === "right",
      })}
      isResizing={isResizing && activeResizeHandle === "left"}
    />
    <ResizeHandle
      onPointerDown={onResizeStart("right")}
      className={cn("right-1", {
        hidden: isResizing && activeResizeHandle === "left",
      })}
      isResizing={isResizing && activeResizeHandle === "right"}
    />
  </>
)

interface ImageToolbarProps {
  error: boolean
  isServerUploading: boolean
  isResizing: boolean
  shouldMerge: boolean
  isLink: boolean
  onView: () => void
  onDownload: () => void
  onCopy: () => void
  onCopyLink: () => void
  onRemoveImg: () => void
}

const ImageToolbar: React.FC<ImageToolbarProps> = ({
  error,
  isServerUploading,
  isResizing,
  shouldMerge,
  isLink,
  onView,
  onDownload,
  onCopy,
  onCopyLink,
  onRemoveImg,
}) => (
  <>
    {error && (
      <ActionWrapper>
        <ActionButton
          icon={<TrashIcon />}
          tooltip="Remove image"
          onClick={onRemoveImg}
        />
      </ActionWrapper>
    )}

    {!isResizing && !error && !isServerUploading && (
      <ImageActions
        shouldMerge={shouldMerge}
        isLink={isLink}
        onView={onView}
        onDownload={onDownload}
        onCopy={onCopy}
        onCopyLink={onCopyLink}
      />
    )}
  </>
)

const getInitSrc = (src: string | { src: string }) =>
  typeof src === "string" ? src : src.src

const getContainerMaxWidth = (container: HTMLElement | null) =>
  container
    ? parseFloat(getComputedStyle(container).getPropertyValue("--editor-width"))
    : Infinity

export const ImageViewBlock: React.FC<NodeViewProps> = ({
  editor,
  node,
  selected,
  updateAttributes,
}) => {
  const {
    src: initialSrc,
    width: initialWidth,
    height: initialHeight,
    fileName,
  } = node.attrs

  const initSrc = React.useMemo(() => getInitSrc(initialSrc), [initialSrc])

  const [imageState, setImageState] = React.useState<ImageState>({
    src: initSrc,
    isServerUploading: false,
    imageLoaded: false,
    isZoomed: false,
    error: false,
    naturalSize: { width: initialWidth, height: initialHeight },
  })

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [activeResizeHandle, setActiveResizeHandle] = React.useState<
    "left" | "right" | null
  >(null)

  const onDimensionsChange = React.useCallback(
    ({ width, height }: ElementDimensions) => {
      updateAttributes({ width, height })
    },
    [updateAttributes]
  )

  const aspectRatio =
    imageState.naturalSize.width / imageState.naturalSize.height
  const maxWidth = MAX_HEIGHT * aspectRatio
  const containerMaxWidth = getContainerMaxWidth(containerRef.current)

  const { isLink, onView, onDownload, onCopy, onCopyLink, onRemoveImg } =
    useImageActions({
      editor,
      node,
      src: imageState.src,
      onViewClick: (isZoomed) =>
        setImageState((prev) => ({ ...prev, isZoomed })),
    })

  const {
    currentWidth,
    currentHeight,
    updateDimensions,
    initiateResize,
    isResizing,
  } = useDragResize({
    initialWidth: initialWidth ?? imageState.naturalSize.width,
    initialHeight: initialHeight ?? imageState.naturalSize.height,
    contentWidth: imageState.naturalSize.width,
    contentHeight: imageState.naturalSize.height,
    gridInterval: 0.1,
    onDimensionsChange,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth: containerMaxWidth > 0 ? containerMaxWidth : maxWidth,
  })

  const shouldMerge = React.useMemo(() => currentWidth <= 180, [currentWidth])

  const handleImageLoad = React.useCallback(
    (ev: React.SyntheticEvent<HTMLImageElement>) => {
      const img = ev.target as HTMLImageElement
      const newNaturalSize = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      }
      setImageState((prev) => ({
        ...prev,
        naturalSize: newNaturalSize,
        imageLoaded: true,
      }))
      updateAttributes({
        width: img.width || newNaturalSize.width,
        height: img.height || newNaturalSize.height,
        alt: img.alt,
        title: img.title,
      })

      if (!initialWidth) {
        updateDimensions((state) => ({ ...state, width: newNaturalSize.width }))
      }
    },
    [initialWidth, updateAttributes, updateDimensions]
  )

  const handleImageError = React.useCallback(() => {
    setImageState((prev) => ({ ...prev, error: true, imageLoaded: true }))
  }, [])

  const handleResizeStart = React.useCallback(
    (direction: "left" | "right") =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        setActiveResizeHandle(direction)
        initiateResize(direction)(event)
      },
    [initiateResize]
  )

  if (!isResizing && activeResizeHandle !== null) {
    setActiveResizeHandle(null)
  }

  useBlobImageUpload({
    editor,
    initSrc,
    fileName,
    updateAttributes,
    setImageState,
  })

  return (
    <NodeViewWrapper
      ref={containerRef}
      data-drag-handle
      className="relative text-center leading-none"
    >
      <div
        className="group/node-image relative mx-auto rounded-md object-contain"
        style={{
          maxWidth: `min(${maxWidth}px, 100%)`,
          width: currentWidth,
          maxHeight: MAX_HEIGHT,
          aspectRatio: `${imageState.naturalSize.width} / ${imageState.naturalSize.height}`,
        }}
      >
        <div
          className={cn(
            "relative flex h-full cursor-default flex-col items-center gap-2 rounded",
            {
              "outline-primary outline-2 outline-offset-1":
                selected || isResizing,
            }
          )}
        >
          <div className="h-full contain-paint">
            <div className="relative h-full">
              <ImageStatus
                isServerUploading={imageState.isServerUploading}
                error={imageState.error}
              />

                <img
                  className={cn(
                    "h-auto rounded object-contain transition-shadow",
                    {
                      "opacity-0": !imageState.imageLoaded || imageState.error,
                    }
                  )}
                  style={{
                    maxWidth: `min(100%, ${maxWidth}px)`,
                    minWidth: `${MIN_WIDTH}px`,
                    maxHeight: MAX_HEIGHT,
                  }}
                  width={currentWidth}
                  height={currentHeight}
                  src={imageState.src}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  alt={node.attrs.alt || ""}
                  title={node.attrs.title || ""}
                  id={node.attrs.id}
                />
              <ImageLightbox
                open={imageState.isZoomed}
                onOpenChange={(open) =>
                  setImageState((prev) => ({ ...prev, isZoomed: open }))
                }
                src={imageState.src}
                alt={node.attrs.alt}
                title={node.attrs.title}
              />
            </div>

            {imageState.isServerUploading && <ImageOverlay />}

            {editor.isEditable &&
              imageState.imageLoaded &&
              !imageState.error &&
              !imageState.isServerUploading && (
                <ImageResizeHandles
                  isResizing={isResizing}
                  activeResizeHandle={activeResizeHandle}
                  onResizeStart={handleResizeStart}
                />
              )}
          </div>

          <ImageToolbar
            error={imageState.error}
            isServerUploading={imageState.isServerUploading}
            isResizing={isResizing}
            shouldMerge={shouldMerge}
            isLink={isLink}
            onView={onView}
            onDownload={onDownload}
            onCopy={onCopy}
            onCopyLink={onCopyLink}
            onRemoveImg={onRemoveImg}
          />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
